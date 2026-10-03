//! In-memory decrypt: the byte-returning sibling of the streaming `download`.
//! Fetch → per-chunk SHA verify → decrypt → decompress → ordered assembly into
//! a single `Vec<u8>` → whole-file integrity check. Same byos-direct→relay
//! resilience as `download` (shared `acquire_chunk`), but returns the plaintext
//! in memory for the shell to hand to thumbnails / preview / the in-app viewer
//! instead of writing a file. Bounded by `MAX_BYTES` so a huge file can't OOM
//! the app: the shell falls back to a streamed download above the cap.

use std::sync::Arc;

use tokio::sync::mpsc;

use zeroize::Zeroize;

use crate::types::{Progress, Stage};

use super::download::{
    acquire_chunk, chunk_source, decrypt_chunk_zeroizing, open_file, OpenedFile,
};
use super::{ordered_writer, EngineContext, EngineError};

/// Hard cap on in-memory decrypts. Thumbnail/preview/viewer targets sit well
/// under this; larger files must use the streaming download-to-disk path so a
/// multi-GB video can never blow the app's heap.
const MAX_BYTES: i64 = 512 * 1024 * 1024;

pub async fn run(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, EngineError> {
    let emit = |stage: Stage, done: u32, total: u32, bytes: i64, total_bytes: i64| {
        (ctx.progress)(Progress {
            file_id: file_id.to_string(),
            file_name: file_id.to_string(),
            stage,
            chunks_done: done,
            chunks_total: total,
            bytes_done: bytes,
            bytes_total: total_bytes,
            speed: 0.0,
        });
    };

    let OpenedFile {
        meta,
        mut key,
        mut hasher,
        can_verify_hash,
        sources,
    } = open_file(
        ctx,
        file_id,
        passphrase,
        user_id,
        space_key,
        Some(MAX_BYTES),
        &emit,
    )
    .await?;
    let total = meta.chunk_count as u32;

    // 3. Concurrent fetch/decrypt feeding the ordered assembler.
    let (tx, rx) = mpsc::channel::<(u32, Vec<u8>)>((ctx.profile.concurrent_downloads * 2).max(4));
    let sem = Arc::new(tokio::sync::Semaphore::new(
        ctx.profile.concurrent_downloads,
    ));
    let mut direct_chunks = 0u32;
    let mut relay_chunks = 0u32;
    let mut fetchers: tokio::task::JoinSet<Result<(), EngineError>> = tokio::task::JoinSet::new();
    for idx in 0..meta.chunk_count {
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        let client = ctx.client.clone();
        let tx = tx.clone();
        let key = key.clone();
        let fid = file_id.to_string();
        let (loc, adapter) = chunk_source(&sources, idx);
        if adapter.is_some() {
            direct_chunks += 1;
        } else {
            relay_chunks += 1;
        }
        fetchers.spawn(async move {
            let _permit = permit;
            let (data, compressed) = acquire_chunk(&client, loc, adapter, &fid, idx, true).await?;
            let plain = tokio::task::spawn_blocking(move || {
                decrypt_chunk_zeroizing(&data, key, compressed)
            })
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))??;
            tx.send((idx as u32, plain))
                .await
                .map_err(|_| EngineError::Other("assembler gone".into()))
        });
    }
    // Every fetcher above cloned its own copy of `key`, this original is no
    // longer needed now that all of them have been spawned.
    key.zeroize();
    drop(tx);
    eprintln!(
        "zcrypt decrypt {file_id}: {direct_chunks} chunk(s) byos-direct, {relay_chunks} via relay"
    );

    // Assemble strictly in index order into one buffer (bounded by MAX_BYTES).
    let mut bytes: Vec<u8> = Vec::with_capacity(meta.original_size.max(0) as usize);
    let mut done_chunks = 0u32;
    let mut done_bytes = 0i64;
    let assemble = ordered_writer::drain(rx, 0, total, |data: Vec<u8>| {
        hasher.update(&data);
        done_chunks += 1;
        done_bytes += data.len() as i64;
        emit(
            Stage::Downloading,
            done_chunks,
            total,
            done_bytes,
            meta.original_size,
        );
        bytes.extend_from_slice(&data);
        Ok(())
    })
    .await;

    // Surface the first fetcher error over a generic assembler error.
    while let Some(res) = fetchers.join_next().await {
        res.map_err(|e| EngineError::Other(format!("join: {e}")))??;
    }
    assemble?;

    // 4. Whole-file integrity (also the wrong-passphrase catch for legacy
    //    files): only enforced when it's actually meaningful; see above.
    emit(
        Stage::Verifying,
        total,
        total,
        done_bytes,
        meta.original_size,
    );
    let got = hasher.finalize_hex();
    if can_verify_hash && got != meta.sha256 {
        return Err(EngineError::Integrity(
            "content hash mismatch: wrong passphrase or corrupt data".into(),
        ));
    }

    emit(Stage::Done, total, total, done_bytes, meta.original_size);
    Ok(bytes)
}
