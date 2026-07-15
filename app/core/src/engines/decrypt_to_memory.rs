//! In-memory decrypt — the byte-returning sibling of the streaming `download`.
//! Fetch → per-chunk SHA verify → decrypt → decompress → ordered assembly into
//! a single `Vec<u8>` → whole-file integrity check. Same byos-direct→relay
//! resilience as `download` (shared `acquire_chunk`), but returns the plaintext
//! in memory for the shell to hand to thumbnails / preview / the in-app viewer
//! instead of writing a file. Bounded by `MAX_BYTES` so a huge file can't OOM
//! the app — the shell falls back to a streamed download above the cap.

use std::sync::Arc;

use base64::Engine as _;
use tokio::sync::mpsc;

use crate::crypto::{self, ContentHasher};
use crate::types::{Progress, Stage};

use super::download::{acquire_chunk, resolve_direct_sources};
use super::{ordered_writer, pipeline, EngineContext, EngineError};

/// Hard cap on in-memory decrypts. Thumbnail/preview/viewer targets sit well
/// under this; larger files must use the streaming download-to-disk path so a
/// multi-GB video can never blow the app's heap.
const MAX_BYTES: i64 = 512 * 1024 * 1024;

pub async fn run(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
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

    // 1. Metadata (retried — a single dropped request must not kill the op).
    emit(Stage::FetchingMeta, 0, 0, 0, 0);
    let client = ctx.client.clone();
    let retry_client = client.clone();
    let meta = client
        .with_retry(6, move || {
            let c = retry_client.clone();
            async move { c.get_file_meta(file_id).await }
        })
        .await
        .map_err(|e| {
            let d = e.detail();
            eprintln!("zcrypt decrypt {file_id}: metadata fetch failed after retries: {d}");
            EngineError::Other(format!("fetch metadata: {d}"))
        })?;

    // In-memory decrypt is for viewer-sized files only; guard against OOM.
    if meta.original_size > MAX_BYTES {
        return Err(EngineError::Other(format!(
            "file too large for in-memory decrypt: {} bytes (cap {MAX_BYTES})",
            meta.original_size
        )));
    }

    let total = meta.chunk_count as u32;
    let b64 = base64::engine::general_purpose::STANDARD;
    let salt = b64
        .decode(&meta.salt)
        .map_err(|e| EngineError::Integrity(format!("salt b64: {e}")))?;
    let wrapped = if meta.wrapped_cek.is_empty() {
        None
    } else {
        Some(
            b64.decode(&meta.wrapped_cek)
                .map_err(|e| EngineError::Integrity(format!("cek b64: {e}")))?,
        )
    };

    // 2. Key (PBKDF2 is blocking; cached — see crypto::resolve_file_key_cached).
    //    A wrong passphrase fails here for envelope files (CEK unwrap) or on the
    //    first chunk decrypt for legacy files. Caching matters most here: many
    //    small decrypts (thumbnails/preview) for the same file+passphrase would
    //    otherwise each re-pay 600k PBKDF2 iterations.
    emit(Stage::DerivingKey, 0, total, 0, meta.original_size);
    let pass = passphrase.to_string();
    let fid = file_id.to_string();
    let key = tokio::task::spawn_blocking(move || {
        crypto::resolve_file_key_cached(&fid, &pass, &salt, wrapped.as_deref())
    })
    .await
    .map_err(|e| EngineError::Other(format!("join: {e}")))??;

    // Whole-file hasher: hmac_v1 needs the per-user dedup key; legacy is SHA-256.
    let mut hasher = if meta.sha256_scheme == "hmac_v1" {
        let pass = passphrase.to_string();
        let uid = user_id.to_string();
        let dk = tokio::task::spawn_blocking(move || crypto::derive_dedup_key(&pass, &uid))
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))?;
        ContentHasher::new("hmac_v1", Some(&dk))
    } else {
        ContentHasher::new("plain", None)
    };

    // 3. Concurrent fetch/decrypt feeding the ordered assembler.
    let (tx, rx) = mpsc::channel::<(u32, Vec<u8>)>((ctx.profile.concurrent_downloads * 2).max(4));
    let (loc_by_idx, direct_adapters) = resolve_direct_sources(ctx, file_id).await;
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
        let direct = loc_by_idx.get(&idx).and_then(|loc| {
            direct_adapters
                .get(&loc.platform)
                .map(|a| (loc.clone(), a.clone()))
        });
        if direct.is_some() {
            direct_chunks += 1;
        } else {
            relay_chunks += 1;
        }
        fetchers.spawn(async move {
            let _permit = permit;
            let (data, compressed) = acquire_chunk(&client, direct, &fid, idx).await?;
            let plain = tokio::task::spawn_blocking(move || {
                pipeline::unprocess_chunk(&data, &key, compressed)
            })
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))??;
            tx.send((idx as u32, plain))
                .await
                .map_err(|_| EngineError::Other("assembler gone".into()))
        });
    }
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

    // 4. Whole-file integrity (also the wrong-passphrase catch for legacy files).
    emit(
        Stage::Verifying,
        total,
        total,
        done_bytes,
        meta.original_size,
    );
    let got = hasher.finalize_hex();
    if got != meta.sha256 {
        return Err(EngineError::Integrity(
            "content hash mismatch — wrong passphrase or corrupt data".into(),
        ));
    }

    emit(Stage::Done, total, total, done_bytes, meta.original_size);
    Ok(bytes)
}
