//! Streaming download — replaces `sidecar/pipeline/download.go` (which
//! buffered whole files in memory) with a bounded pipeline: concurrent chunk
//! fetches → per-chunk SHA verify → decrypt → decompress → ordered write to a
//! .part file (feeding the whole-file hasher in order) → integrity check →
//! atomic rename.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use base64::Engine as _;
use tokio::sync::mpsc;

use crate::adapters::{self, PlatformAdapter};
use crate::api::types::ChunkLocator;
use crate::crypto::{self, ContentHasher};
use crate::types::{ChunkRef, Progress, Stage};

use super::{ordered_writer, pipeline, EngineContext, EngineError};

/// Per-chunk direct-download sources for byos-direct: the owner's locators plus
/// one own-token adapter per platform. Any chunk absent here (or on a platform
/// with no creds — e.g. a managed-pool file) falls back to the relay endpoint.
type DirectSources = (
    HashMap<i64, ChunkLocator>,
    HashMap<String, Arc<dyn PlatformAdapter>>,
);

/// Best-effort resolve of byos-direct sources. On any failure (not the owner,
/// endpoint down, no creds) it returns empties and the caller relays everything.
async fn resolve_direct_sources(ctx: &EngineContext, file_id: &str) -> DirectSources {
    let mut locs = HashMap::new();
    let mut adapters_by_platform: HashMap<String, Arc<dyn PlatformAdapter>> = HashMap::new();
    if let Ok(resp) = ctx.client.get_file_locators(file_id).await {
        for c in resp.chunks {
            if !adapters_by_platform.contains_key(&c.platform) {
                if let Some(creds) = (ctx.creds)(&c.platform) {
                    if let Some(a) =
                        adapters::new_adapter(&c.platform, &creds.token, &creds.account)
                    {
                        adapters_by_platform.insert(c.platform.clone(), Arc::from(a));
                    }
                }
            }
            locs.insert(c.index, c);
        }
    }
    (locs, adapters_by_platform)
}

pub async fn run(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    save_path: &Path,
) -> Result<(), EngineError> {
    let emit = |stage: Stage, done: u32, total: u32, bytes: i64, total_bytes: i64| {
        (ctx.progress)(Progress {
            file_id: file_id.to_string(),
            file_name: save_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            stage,
            chunks_done: done,
            chunks_total: total,
            bytes_done: bytes,
            bytes_total: total_bytes,
            speed: 0.0,
        });
    };

    // 1. Metadata.
    emit(Stage::FetchingMeta, 0, 0, 0, 0);
    let meta = ctx.client.get_file_meta(file_id).await?;
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

    // 2. Key (PBKDF2 is blocking).
    emit(Stage::DerivingKey, 0, total, 0, meta.original_size);
    let pass = passphrase.to_string();
    let key = tokio::task::spawn_blocking(move || {
        crypto::resolve_file_key(&pass, &salt, wrapped.as_deref())
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

    // 3. Concurrent fetch/decrypt feeding the ordered writer. The sink writes
    //    synchronously through a BufWriter (big sequential chunk writes).
    let part_path = save_path.with_extension("zcrypt-part");
    let mut out = std::io::BufWriter::new(std::fs::File::create(&part_path)?);
    let (tx, rx) = mpsc::channel::<(u32, Vec<u8>)>((ctx.profile.concurrent_downloads * 2).max(4));

    // byos-direct: pull each chunk straight from the user's OWN storage with the
    // user's OWN token (no relay/egress). Chunks with no direct source fall back
    // to the relay endpoint, so a mixed or managed-pool file still downloads.
    let (loc_by_idx, direct_adapters) = resolve_direct_sources(ctx, file_id).await;

    let sem = Arc::new(tokio::sync::Semaphore::new(
        ctx.profile.concurrent_downloads,
    ));
    let mut fetchers: tokio::task::JoinSet<Result<(), EngineError>> = tokio::task::JoinSet::new();
    for idx in 0..meta.chunk_count {
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        let client = ctx.client.clone();
        let tx = tx.clone();
        let key = key.clone();
        let fid = file_id.to_string();
        // Resolve this chunk's direct source (locator + own-token adapter) up
        // front so the task owns cheap clones, not the shared maps.
        let direct = loc_by_idx.get(&idx).and_then(|loc| {
            direct_adapters
                .get(&loc.platform)
                .map(|a| (loc.clone(), a.clone()))
        });
        fetchers.spawn(async move {
            let _permit = permit;
            // (ciphertext bytes, expected sha of those bytes, zstd-compressed?)
            let (data, sha256, compressed) = if let Some((loc, adapter)) = direct {
                let r = ChunkRef {
                    platform: loc.platform,
                    account: loc.account,
                    repo: loc.repo,
                    remote_path: loc.remote_path,
                    size: loc.size,
                    sha256: loc.sha256.clone(),
                    compressed: loc.compressed,
                    ..ChunkRef::default()
                };
                let bytes = adapter
                    .download(&r)
                    .await
                    .map_err(|e| EngineError::Other(format!("direct chunk {idx}: {e}")))?;
                (bytes, loc.sha256, loc.compressed)
            } else {
                let chunk = client.get_chunk(&fid, idx).await?;
                (chunk.data, chunk.sha256, chunk.compressed)
            };
            // Transport integrity: the SHA is of the encrypted bytes.
            if !sha256.is_empty() {
                let got = crypto::sha256_hex(&data);
                if got != sha256 {
                    return Err(EngineError::Integrity(format!("chunk {idx}: sha mismatch")));
                }
            }
            let plain = tokio::task::spawn_blocking(move || {
                pipeline::unprocess_chunk(&data, &key, compressed)
            })
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))??;
            tx.send((idx as u32, plain))
                .await
                .map_err(|_| EngineError::Other("writer gone".into()))
        });
    }
    drop(tx);

    // Writer: strict order → hasher + disk. Progress per chunk.
    let mut written_chunks = 0u32;
    let mut written_bytes = 0i64;
    let write_result = ordered_writer::drain(rx, 0, total, |data: Vec<u8>| {
        hasher.update(&data);
        written_chunks += 1;
        written_bytes += data.len() as i64;
        emit(
            Stage::Downloading,
            written_chunks,
            total,
            written_bytes,
            meta.original_size,
        );
        std::io::Write::write_all(&mut out, &data).map_err(EngineError::Io)
    })
    .await;

    // Surface the first fetcher error over a generic writer error.
    while let Some(res) = fetchers.join_next().await {
        res.map_err(|e| EngineError::Other(format!("join: {e}")))??;
    }
    write_result?;
    std::io::Write::flush(&mut out)?;
    out.into_inner()
        .map_err(|e| EngineError::Io(e.into_error()))?
        .sync_all()?;

    // 4. Whole-file integrity.
    emit(
        Stage::Verifying,
        total,
        total,
        written_bytes,
        meta.original_size,
    );
    let got = hasher.finalize_hex();
    if got != meta.sha256 {
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err(EngineError::Integrity(
            "content hash mismatch — wrong passphrase or corrupt data".into(),
        ));
    }

    // 5. Atomic finalize.
    emit(
        Stage::Saving,
        total,
        total,
        written_bytes,
        meta.original_size,
    );
    tokio::fs::rename(&part_path, save_path).await?;
    emit(Stage::Done, total, total, written_bytes, meta.original_size);
    Ok(())
}
