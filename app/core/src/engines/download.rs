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
use zeroize::Zeroize;

use crate::adapters::{self, PlatformAdapter};
use crate::api::types::ChunkLocator;
use crate::api::Client;
use crate::crypto::{self, ContentHasher};
use crate::types::{ChunkRef, Progress, Stage};

use super::{ordered_writer, pipeline, EngineContext, EngineError};

/// Per-chunk direct-download sources for byos-direct: the owner's locators plus
/// one own-token adapter per platform. Any chunk absent here (or on a platform
/// with no creds — e.g. a managed-pool file) falls back to the relay endpoint.
pub(super) type DirectSources = (
    HashMap<i64, ChunkLocator>,
    HashMap<String, Arc<dyn PlatformAdapter>>,
);

/// Best-effort resolve of byos-direct sources. On any failure (not the owner,
/// endpoint down, no creds) it returns empties and the caller relays everything.
/// Retries transient network failures (3x, capped backoff) instead of a bare
/// single `.await` — on a flaky connection that used to silently sit on
/// "deriving_key" for the client's full 30s request timeout with no feedback
/// and no fallback; after the retries are exhausted it still degrades to an
/// all-relay download rather than failing the whole operation.
pub(super) async fn resolve_direct_sources(ctx: &EngineContext, file_id: &str) -> DirectSources {
    let mut locs = HashMap::new();
    let mut adapters_by_platform: HashMap<String, Arc<dyn PlatformAdapter>> = HashMap::new();
    let client = ctx.client.clone();
    let retry_client = client.clone();
    let fid = file_id.to_string();
    let result = client
        .with_retry(3, move || {
            let c = retry_client.clone();
            let f = fid.clone();
            async move { c.get_file_locators(&f).await }
        })
        .await;
    if let Err(e) = &result {
        eprintln!(
            "zcrypt download {file_id}: locators fetch failed after retries, falling back to full relay: {}",
            e.detail()
        );
    }
    if let Ok(resp) = result {
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

/// Acquire one chunk's ENCRYPTED wire bytes. Try byos-direct FIRST but fail fast
/// (2 tries), then FALL BACK to the backend relay (4 tries). This is the key fix
/// for a platform unreachable from THIS network — e.g. Telegram in a region that
/// blocks it: the client can't hit api.telegram.org directly, but the server
/// can, so relaying still completes instead of hanging on a dead direct source.
/// A verified-bad chunk (sha mismatch) is retried too — a truncated transfer can
/// look complete-but-wrong — but never past the caps. Only when BOTH paths are
/// exhausted does it error. Shared by the streaming `download` and the in-memory
/// `decrypt_to_memory` so the fallback/resilience logic lives in one place.
pub(super) async fn acquire_chunk(
    client: &Arc<Client>,
    direct: Option<(ChunkLocator, Arc<dyn PlatformAdapter>)>,
    file_id: &str,
    idx: i64,
) -> Result<(Vec<u8>, bool), EngineError> {
    let sha_ok = |data: &[u8], sha: &str| sha.is_empty() || crypto::sha256_hex(data) == *sha;
    let mut last_err: Option<EngineError> = None;
    let mut out: Option<(Vec<u8>, bool)> = None;

    // --- byos-direct (fast: 2 attempts, then hand off to relay) ---
    if let Some((loc, adapter)) = &direct {
        for n in 0..2u32 {
            let r = ChunkRef {
                platform: loc.platform.clone(),
                account: loc.account.clone(),
                repo: loc.repo.clone(),
                remote_path: loc.remote_path.clone(),
                size: loc.size,
                sha256: loc.sha256.clone(),
                compressed: loc.compressed,
                ..ChunkRef::default()
            };
            match adapter.download(&r).await {
                Ok(bytes) if sha_ok(&bytes, &loc.sha256) => {
                    out = Some((bytes, loc.compressed));
                    break;
                }
                Ok(_) => {
                    last_err = Some(EngineError::Integrity(format!(
                        "chunk {idx}: sha mismatch (direct)"
                    )))
                }
                Err(e) => last_err = Some(EngineError::Other(format!("direct chunk {idx}: {e}"))),
            }
            if n + 1 < 2 {
                tokio::time::sleep(std::time::Duration::from_millis(500 << n)).await;
            }
        }
    }

    // --- relay fallback (4 attempts) ---
    if out.is_none() {
        for n in 0..4u32 {
            match client.get_chunk(file_id, idx).await {
                Ok(c) if sha_ok(&c.data, &c.sha256) => {
                    out = Some((c.data, c.compressed));
                    break;
                }
                Ok(_) => {
                    last_err = Some(EngineError::Integrity(format!(
                        "chunk {idx}: sha mismatch (relay)"
                    )))
                }
                Err(e) => last_err = Some(EngineError::from(e)),
            }
            if n + 1 < 4 {
                let delay = std::time::Duration::from_millis((500u64 << n).min(8_000));
                tokio::time::sleep(delay).await;
            }
        }
    }

    out.ok_or_else(|| {
        last_err.unwrap_or_else(|| EngineError::Other(format!("chunk {idx}: no attempts")))
    })
}

/// Decrypt (+ decompress) one chunk, then zeroize the caller's key clone — it's
/// only needed for the AES-GCM cipher setup inside `unprocess_chunk`, which
/// copies it into its own key schedule, so wiping it here afterward is safe.
/// CPU-bound; call inside `spawn_blocking`. Shared by `download` and
/// `decrypt_to_memory` (each clones the resolved file key once per chunk) so
/// this "zeroize after use" placement is reasoned about, and can go wrong, in
/// exactly one place instead of two.
pub(super) fn decrypt_chunk_zeroizing(
    data: &[u8],
    mut key: Vec<u8>,
    compressed: bool,
) -> Result<Vec<u8>, EngineError> {
    let result = pipeline::unprocess_chunk(data, &key, compressed);
    key.zeroize();
    result
}

pub async fn run(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
    save_path: &Path,
) -> Result<(), EngineError> {
    let is_space_mode = space_key.is_some();
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

    // 1. Metadata. Retry the control-plane call — on a flaky/filtered network a
    //    single dropped request here used to kill the whole download before a
    //    byte moved (the "error sending request for url .../meta" failure). The
    //    detail() surfaces reqwest's hidden underlying cause if it still fails.
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
            // Full cause to stderr too — the UI toast truncates it, and this is
            // the one line that says WHY a flaky/filtered network is failing.
            eprintln!("zcrypt download {file_id}: metadata fetch failed after retries: {d}");
            EngineError::Other(format!("fetch metadata: {d}"))
        })?;
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
    let mut key = if let Some(space_key) = space_key {
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
    // canVerifyHash exactly (lib/download-session.ts): still hash (falling back
    // to plain SHA-256) for uniform per-chunk work, but skip the final
    // comparison rather than derive a MAC key from nothing, which would just
    // produce a value that can never match and make every hmac_v1 space file
    // spuriously "fail" integrity. Per-chunk SHA-256 (already verified during
    // fetch) plus the chunk-count assertion (ordered_writer::drain) are what
    // space/share downloads rely on instead — same trust level as the
    // public-share path.
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
    // HMAC's new_from_slice() above already copied the key into its own
    // internal state — this caller-side copy is no longer needed.
    if let Some(mut mk) = mac_key {
        mk.zeroize();
    }

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
    // byos-direct telemetry: how many chunks go straight to the user's storage
    // (zero server egress) vs. fall back to the relay. Logged at the end so we
    // can verify the whole point of the migration — bytes not touching the
    // server — is actually happening on this device.
    let mut direct_chunks = 0u32;
    let mut relay_chunks = 0u32;
    let mut fetchers: tokio::task::JoinSet<Result<(), EngineError>> = tokio::task::JoinSet::new();
    for idx in 0..meta.chunk_count {
        // Stop scheduling new fetches the moment the user cancels; in-flight
        // tasks below also short-circuit at entry, and the tail cleans up the
        // partial .part file.
        if ctx.cancel.is_cancelled() {
            break;
        }
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        let client = ctx.client.clone();
        let cancel = ctx.cancel.clone();
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
        if direct.is_some() {
            direct_chunks += 1;
        } else {
            relay_chunks += 1;
        }
        fetchers.spawn(async move {
            let _permit = permit;
            if cancel.is_cancelled() {
                return Err(EngineError::Cancelled);
            }
            let (data, compressed) = acquire_chunk(&client, direct, &fid, idx).await?;
            let plain = tokio::task::spawn_blocking(move || {
                decrypt_chunk_zeroizing(&data, key, compressed)
            })
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))??;
            tx.send((idx as u32, plain))
                .await
                .map_err(|_| EngineError::Other("writer gone".into()))
        });
    }
    // Every fetcher above cloned its own copy of `key` — this original is no
    // longer needed now that all of them have been spawned.
    key.zeroize();
    drop(tx);
    eprintln!(
        "zcrypt download {file_id}: {direct_chunks} chunk(s) byos-direct, {relay_chunks} via relay"
    );

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

    // Drain fetchers, preferring a real fetcher error (including a Cancelled
    // from an in-flight task) over the sink's generic "writer gone". On ANY
    // error — failure OR cancel — remove the partial .part file so a stopped
    // download never leaves a half-written artifact behind.
    let mut first_err: Option<EngineError> = None;
    while let Some(res) = fetchers.join_next().await {
        let r = res.unwrap_or_else(|e| Err(EngineError::Other(format!("join: {e}"))));
        if let Err(e) = r {
            if first_err.is_none() {
                first_err = Some(e);
            }
        }
    }
    if first_err.is_none() {
        if let Err(e) = write_result {
            first_err = Some(e);
        }
    }
    // The spawn loop can break early on cancel before any task errors; catch
    // that case explicitly so a prompt cancel is still reported as Cancelled.
    if first_err.is_none() && ctx.cancel.is_cancelled() {
        first_err = Some(EngineError::Cancelled);
    }
    if let Some(e) = first_err {
        drop(out);
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err(e);
    }
    std::io::Write::flush(&mut out)?;
    out.into_inner()
        .map_err(|e| EngineError::Io(e.into_error()))?
        .sync_all()?;

    // 4. Whole-file integrity — only enforced when it's actually meaningful;
    //    see the mac_key/can_verify_hash comment above.
    emit(
        Stage::Verifying,
        total,
        total,
        written_bytes,
        meta.original_size,
    );
    let got = hasher.finalize_hex();
    if can_verify_hash && got != meta.sha256 {
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
