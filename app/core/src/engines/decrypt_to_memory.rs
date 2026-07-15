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
    space_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, EngineError> {
    let is_space_mode = space_key.is_some();
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

    // 2. Key. `space_key` here is actually the file's ALREADY-RESOLVED content
    //    key, not the space's raw symmetric key: a shared file's CEK is wrapped
    //    under the space key in the SharedVaultFile record (a field the generic
    //    file-meta response above does NOT carry — meta.wrapped_cek is the
    //    OWNER's passphrase-wrapped envelope, a different ciphertext entirely).
    //    So the caller (lib/spaces.ts's spaceFileKey()) unwraps client-side
    //    using data it already holds and hands us the final key directly — this
    //    mirrors the web client's `resolveKey` override exactly (no unwrap
    //    happens here). Passphrase mode (PBKDF2, cached) is unchanged.
    emit(Stage::DerivingKey, 0, total, 0, meta.original_size);
    let key = if let Some(space_key) = space_key {
        space_key
    } else {
        let pass = passphrase.to_string();
        let fid = file_id.to_string();
        tokio::task::spawn_blocking(move || {
            crypto::resolve_file_key_cached(&fid, &pass, &salt, wrapped.as_deref())
        })
        .await
        .map_err(|e| EngineError::Other(format!("join: {e}")))??
    };

    // Whole-file hasher + whether its result is actually comparable against
    // meta.sha256. hmac_v1 files store a per-user KEYED MAC there, which needs
    // the passphrase (owner/folder path) to recompute — a space download has no
    // passphrase, so it CANNOT verify that MAC. Mirrors the web client's
    // canVerifyHash exactly (lib/download-session.ts): we still hash (falling
    // back to plain SHA-256) so the per-chunk work is uniform, but skip the
    // final comparison rather than derive a MAC key from nothing, which would
    // just produce a value that can never match and make every hmac_v1 space
    // file spuriously "fail" integrity. Per-chunk SHA-256 (already verified in
    // acquire_chunk) plus the chunk-count assertion below are what space/share
    // downloads rely on instead — same trust level as the public-share path.
    let mac_key = if meta.sha256_scheme == "hmac_v1" && !is_space_mode {
        let pass = passphrase.to_string();
        let uid = user_id.to_string();
        Some(
            tokio::task::spawn_blocking(move || crypto::derive_dedup_key(&pass, &uid).to_vec())
                .await
                .map_err(|e| EngineError::Other(format!("join: {e}")))?,
        )
    } else {
        None
    };
    let can_verify_hash = crypto::can_verify_whole_file_hash(&meta.sha256_scheme, is_space_mode);
    let mut hasher = match &mac_key {
        Some(k) => ContentHasher::new("hmac_v1", Some(k)),
        None => ContentHasher::new("plain", None),
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

    // 4. Whole-file integrity (also the wrong-passphrase catch for legacy
    //    files) — only enforced when it's actually meaningful; see above.
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
            "content hash mismatch — wrong passphrase or corrupt data".into(),
        ));
    }

    emit(Stage::Done, total, total, done_bytes, meta.original_size);
    Ok(bytes)
}
