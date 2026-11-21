//! Streaming download, replaces `sidecar/pipeline/download.go` (which
//! buffered whole files in memory) with a bounded pipeline: concurrent chunk
//! fetches → per-chunk SHA verify → decrypt → decompress → ordered write to a
//! .part file (feeding the whole-file hasher in order) → integrity check →
//! atomic rename.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
#[cfg(test)]
use std::sync::Mutex as StdMutex;

use base64::Engine as _;
use zeroize::Zeroize;

use crate::adapters::{self, AdapterError, PlatformAdapter};
use crate::api::types::{ChunkLocator, FileMetaResponse};
use crate::api::Client;
use crate::crypto::{self, ContentHasher};
use crate::types::{ChunkRef, Progress, Stage};

use super::gate::{self, Gate};
use super::{chunk_cache, or_cancel, ordered_writer, pipeline, EngineContext, EngineError};

/// Per-chunk direct-download sources for byos-direct: the owner's locators plus
/// one own-token adapter per platform. Any chunk absent here (or on a platform
/// with no creds, e.g. a managed-pool file) falls back to the relay endpoint.
pub(super) type DirectSources = (
    HashMap<i64, ChunkLocator>,
    HashMap<String, Arc<dyn PlatformAdapter>>,
);

/// Best-effort resolve of byos-direct sources. On any failure (not the owner,
/// endpoint down, no creds) it returns empties and the caller relays everything.
/// Retries transient network failures (3x, capped backoff) instead of a bare
/// single `.await`: on a flaky connection that used to silently sit on
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
                        adapters::shared_adapter(&c.platform, &creds.token, &creds.account)
                    {
                        adapters_by_platform.insert(c.platform.clone(), a);
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
/// for a platform unreachable from THIS network, e.g. Telegram in a region that
/// blocks it: the client can't hit api.telegram.org directly, but the server
/// can, so relaying still completes instead of hanging on a dead direct source.
/// A verified-bad chunk (sha mismatch) is retried too, a truncated transfer can
/// look complete-but-wrong, but never past the caps. Only when BOTH paths are
/// exhausted does it error. Shared by the streaming `download` and the in-memory
/// `decrypt_to_memory` so the fallback/resilience logic lives in one place.
/// A chunk whose sha is known up front (the owner's locator) is served from
/// the on-disk ciphertext cache when present. With `cache_fetched`, every
/// verified fetch with a known sha is written back to it; streaming saves pass
/// false so one large download doesn't rewrite itself to disk and evict the
/// open cache.
pub(super) async fn acquire_chunk(
    client: &Arc<Client>,
    gate: &Gate,
    loc: Option<ChunkLocator>,
    adapter: Option<Arc<dyn PlatformAdapter>>,
    file_id: &str,
    idx: i64,
    cache_fetched: bool,
) -> Result<(Vec<u8>, bool), EngineError> {
    if let Some(l) = &loc {
        if let Some(data) = chunk_cache::get(&l.sha256).await {
            return Ok((data, l.compressed));
        }
    }
    let (data, compressed, sha) = fetch_chunk(client, gate, loc, adapter, file_id, idx).await?;
    if cache_fetched && !sha.is_empty() {
        chunk_cache::put(&sha, &data);
    }
    Ok((data, compressed))
}

/// The per-chunk source pair for `idx`: its locator (when the caller owns the
/// file) and, when this device holds a token for that platform, the warm
/// adapter to pull it byos-direct.
pub(super) fn chunk_source(
    sources: &DirectSources,
    idx: i64,
) -> (Option<ChunkLocator>, Option<Arc<dyn PlatformAdapter>>) {
    let (locs, adapters) = sources;
    let loc = locs.get(&idx).cloned();
    let adapter = loc
        .as_ref()
        .and_then(|l| adapters.get(&l.platform))
        .cloned();
    (loc, adapter)
}

/// Bytes of the file that can only come through the server relay: chunks with
/// no direct source on this device and no platform link (GitHub and Hugging
/// Face chunks have one). A chunk this device has no locator for counts at the
/// file's average chunk size.
fn server_only_bytes(sources: &DirectSources, chunk_count: i64, encrypted_size: i64) -> i64 {
    let avg = if chunk_count > 0 {
        encrypted_size / chunk_count
    } else {
        0
    };
    (0..chunk_count)
        .map(|idx| match chunk_source(sources, idx) {
            (_, Some(_)) => 0,
            (Some(l), None) if matches!(l.platform.as_str(), "github" | "huggingface") => 0,
            (Some(l), None) => l.size,
            (None, _) => avg,
        })
        .sum()
}

/// Stops a download that cannot fit the transfer allowance before it starts,
/// with the server's own refusal, instead of failing partway. A failed quota
/// lookup lets it start: the server still checks every chunk.
async fn check_allowance_upfront(ctx: &EngineContext, need: i64) -> Result<(), EngineError> {
    if need <= 0 {
        return Ok(());
    }
    let Ok(q) = ctx.client.get_quota().await else {
        return Ok(());
    };
    match q.refusal(need) {
        None => Ok(()),
        Some(r) => Err(EngineError::Api(crate::api::ApiError::Status {
            status: 403,
            body: serde_json::json!({
                "error": "not enough transfer allowance left for this download",
                "code": r.code,
                "limit_bytes": r.limit_bytes,
                "used_bytes": r.used_bytes,
                "resets_at": r.resets_at,
                "needed_bytes": need,
            })
            .to_string(),
        })),
    }
}

/// Chunks in a row whose platform link fails before links stop for the file.
const LINK_FAILURES_BEFORE_OFF: u32 = 2;

/// A GitHub or Hugging Face chunk read from a short-lived platform link the
/// server mints, so its bytes skip the server and the allowance. Mirrors the
/// web's `viaLink` (lib/chunk-source.ts): a chunk with no link (409) or bad
/// bytes goes through the server on its own; a failed read retries once with a
/// fresh link; LINK_FAILURES_BEFORE_OFF chunks in a row failing turn links off
/// for the rest of the file.
async fn via_link(
    client: &Arc<Client>,
    gate: &Gate,
    file_id: &str,
    idx: i64,
) -> Result<Option<(Vec<u8>, bool, String)>, EngineError> {
    if gate.link_failures.load(Ordering::Relaxed) >= LINK_FAILURES_BEFORE_OFF {
        return Ok(None);
    }
    for _ in 0..2 {
        let link = match or_cancel(&gate.cancel, client.get_chunk_link(file_id, idx)).await? {
            Ok(Some(link)) => link,
            Ok(None) => return Ok(None),
            Err(_) => continue,
        };
        match or_cancel(&gate.cancel, client.download_linked_chunk(&link.url)).await? {
            Ok(data) if link.sha256.is_empty() || crypto::sha256_hex(&data) == link.sha256 => {
                gate.link_failures.store(0, Ordering::Relaxed);
                return Ok(Some((data, link.compressed, link.sha256)));
            }
            Ok(_) => return Ok(None),
            Err(_) => continue,
        }
    }
    gate.link_failures.fetch_add(1, Ordering::Relaxed);
    Ok(None)
}

fn is_unreachable(e: &AdapterError) -> bool {
    matches!(e, AdapterError::Http(h) if h.is_connect())
}

async fn fetch_chunk(
    client: &Arc<Client>,
    gate: &Gate,
    loc: Option<ChunkLocator>,
    adapter: Option<Arc<dyn PlatformAdapter>>,
    file_id: &str,
    idx: i64,
) -> Result<(Vec<u8>, bool, String), EngineError> {
    let cancel = &gate.cancel;
    let sha_ok = |data: &[u8], sha: &str| sha.is_empty() || crypto::sha256_hex(data) == *sha;
    let direct = match (loc, adapter) {
        (Some(l), Some(a)) => Some((l, a)),
        _ => None,
    };
    let mut last_err: Option<EngineError> = None;

    // Direct first. If the platform's own storage cannot serve the chunk, the
    // relay is used only while the rest of the transfer fits the allowance;
    // otherwise (or when the relay refuses) wait for Telegram and go direct
    // again. A chunk with no direct source relays as before: the server
    // enforces the allowance for it.
    loop {
        let mut out: Option<(Vec<u8>, bool, String)> = None;
        let mut blocked = false;
        if let Some((loc, adapter)) = &direct {
            let origin = gate::origin_for(&loc.platform);
            if let Some(o) = origin {
                blocked = !gate.env.reachable(o).await;
            }
            for n in 0..2u32 {
                if blocked {
                    break;
                }
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
                match or_cancel(cancel, adapter.download(&r)).await? {
                    Ok(bytes) if sha_ok(&bytes, &loc.sha256) => {
                        out = Some((bytes, loc.compressed, loc.sha256.clone()));
                        break;
                    }
                    Ok(_) => {
                        last_err = Some(EngineError::Integrity(format!(
                            "chunk {idx}: sha mismatch (direct)"
                        )))
                    }
                    Err(e) if is_unreachable(&e) => {
                        eprintln!("zcrypt: {} unreachable byos-direct ({e})", loc.platform);
                        if let Some(o) = origin {
                            gate.env.mark_blocked(o);
                            blocked = true;
                        }
                        last_err = Some(EngineError::Other(format!("direct chunk {idx}: {e}")));
                        break;
                    }
                    Err(e) => {
                        let transient = e.is_transient();
                        let delay = crate::transport::honor_retry_after(
                            crate::transport::backoff(n, 500, 8_000),
                            e.retry_after_secs(),
                        );
                        last_err = Some(EngineError::Other(format!("direct chunk {idx}: {e}")));
                        if !transient {
                            break;
                        }
                        if n + 1 < 2 {
                            or_cancel(cancel, tokio::time::sleep(delay)).await?;
                        }
                        continue;
                    }
                }
                if n + 1 < 2 {
                    or_cancel(
                        cancel,
                        tokio::time::sleep(crate::transport::backoff(n, 500, 8_000)),
                    )
                    .await?;
                }
            }
        }
        if let Some(o) = out {
            return Ok(o);
        }
        if direct.is_none() {
            if let Some(o) = via_link(client, gate, file_id, idx).await? {
                return Ok(o);
            }
        }

        if let Some((loc, _)) = &direct {
            let need = gate.remaining.load(Ordering::Relaxed).max(loc.size);
            if !gate.env.fits(need, 0).await {
                match gate::origin_for(&loc.platform) {
                    Some(o) if blocked => {
                        gate.wait_reachable(gate::WAIT_TELEGRAM_BLOCKED, o).await?;
                        continue;
                    }
                    _ => {
                        return Err(last_err.unwrap_or_else(|| {
                            EngineError::Other(format!("chunk {idx}: not available directly"))
                        }))
                    }
                }
            }
        }

        let mut refused = false;
        for n in 0..4u32 {
            let mut delay = crate::transport::backoff(n, 500, 8_000);
            match or_cancel(cancel, client.get_chunk(file_id, idx)).await? {
                Ok(c) if sha_ok(&c.data, &c.sha256) => {
                    return Ok((c.data, c.compressed, c.sha256));
                }
                Ok(_) => {
                    last_err = Some(EngineError::Integrity(format!(
                        "chunk {idx}: sha mismatch (relay)"
                    )))
                }
                Err(e) => {
                    let e = EngineError::from(e);
                    refused = gate::is_allowance_refusal(&e);
                    if !e.is_transient() {
                        last_err = Some(e);
                        break;
                    }
                    delay = crate::transport::honor_retry_after(delay, e.retry_after_secs());
                    last_err = Some(e);
                }
            }
            if n + 1 < 4 {
                or_cancel(cancel, tokio::time::sleep(delay)).await?;
            }
        }
        match &direct {
            Some((loc, _)) if refused && blocked => match gate::origin_for(&loc.platform) {
                Some(o) => {
                    gate.wait_reachable(gate::WAIT_ALLOWANCE_USED_UP, o).await?;
                }
                None => break,
            },
            _ => break,
        }
    }
    Err(last_err.unwrap_or_else(|| EngineError::Other(format!("chunk {idx}: no attempts"))))
}

/// Decrypt (+ decompress) one chunk, then zeroize the caller's key clone, it's
/// only needed for the AES-GCM cipher setup inside `unprocess_chunk`, which
/// copies it into its own key schedule, so wiping it here afterward is safe.
/// One chunk fetched (byos-direct when this device holds the platform's
/// token, else through the relay) and decrypted off the async runtime. Shared
/// by `download` and `decrypt_to_memory`.
pub(super) fn fetch_plain_chunk(
    ctx: &EngineContext,
    gate: &Gate,
    sources: &DirectSources,
    key: &[u8],
    file_id: &str,
    idx: u32,
    cache_fetched: bool,
) -> impl std::future::Future<Output = Result<Vec<u8>, EngineError>> + Send + 'static {
    let (loc, adapter) = chunk_source(sources, idx as i64);
    let client = ctx.client.clone();
    let gate = gate.clone();
    let cancel = ctx.cancel.clone();
    let key = key.to_vec();
    let fid = file_id.to_string();
    async move {
        if cancel.is_cancelled() {
            return Err(EngineError::Cancelled);
        }
        let size = loc.as_ref().map_or(0, |l| l.size);
        let (data, compressed) = acquire_chunk(
            &client,
            &gate,
            loc,
            adapter,
            &fid,
            idx as i64,
            cache_fetched,
        )
        .await?;
        gate.remaining.fetch_sub(size, Ordering::Relaxed);
        tokio::task::spawn_blocking(move || decrypt_chunk_zeroizing(&data, key, compressed))
            .await
            .map_err(|e| EngineError::Other(format!("join: {e}")))?
    }
}

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

fn unique_part_path(save_path: &Path) -> std::path::PathBuf {
    let name = save_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    save_path.with_file_name(format!("{name}.{}.zcrypt-part", uuid::Uuid::new_v4()))
}

pub async fn run(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
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
            waiting: None,
        });
    };

    let OpenedFile {
        meta,
        mut key,
        mut hasher,
        can_verify_hash,
        sources,
    } = open_file(ctx, file_id, passphrase, user_id, space_key, None, &emit).await?;
    let total = meta.chunk_count as u32;
    check_allowance_upfront(
        ctx,
        server_only_bytes(&sources, meta.chunk_count, meta.encrypted_size),
    )
    .await?;
    let gate = Gate::live(
        ctx,
        Some(Gate::waiting_progress(
            ctx,
            file_id.to_string(),
            save_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            meta.original_size,
        )),
        meta.original_size,
    );

    // 3. Concurrent fetch/decrypt feeding the ordered writer. The sink writes
    //    synchronously through a BufWriter (big sequential chunk writes).
    let part_path = unique_part_path(save_path);
    let mut out = std::io::BufWriter::new(
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&part_path)?,
    );
    // byos-direct telemetry: how many chunks go straight to the user's storage
    // (zero server egress) vs. fall back to the relay.
    let direct_chunks = (0..meta.chunk_count)
        .filter(|&idx| chunk_source(&sources, idx).1.is_some())
        .count();
    eprintln!(
        "zcrypt download {file_id}: {direct_chunks} chunk(s) byos-direct, {} via relay",
        meta.chunk_count as usize - direct_chunks
    );

    // Writer: strict order → hasher + disk. Progress per chunk.
    let concurrency = ctx.profile.concurrent_downloads;
    let mut written_chunks = 0u32;
    let mut written_bytes = 0i64;
    let result = ordered_writer::fetch_in_order(
        total,
        concurrency,
        (concurrency * 3).max(4) as u32,
        || ctx.cancel.is_cancelled(),
        |idx| fetch_plain_chunk(ctx, &gate, &sources, &key, file_id, idx, false),
        |data: Vec<u8>| {
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
        },
    )
    .await;
    key.zeroize();
    // On ANY error (failure OR cancel) remove the partial .part file so a
    // stopped download never leaves a half-written artifact behind; a cancel is
    // reported as such even when it surfaced as a short file.
    let first_err = if ctx.cancel.is_cancelled() {
        Some(EngineError::Cancelled)
    } else {
        result.err()
    };
    if let Some(e) = first_err {
        drop(out);
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err(e);
    }
    std::io::Write::flush(&mut out)?;
    out.into_inner()
        .map_err(|e| EngineError::Io(e.into_error()))?
        .sync_all()?;

    // 4. Whole-file integrity: only enforced when it's actually meaningful;
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
            "content hash mismatch: wrong passphrase or corrupt data".into(),
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

/// Everything a download needs before its first chunk fetch.
pub(super) struct OpenedFile {
    pub meta: FileMetaResponse,
    pub key: Vec<u8>,
    pub hasher: ContentHasher,
    pub can_verify_hash: bool,
    pub sources: DirectSources,
}

/// Steps 1-2 shared by `download` and `decrypt_to_memory`, with every
/// independent step overlapped: metadata and byos-direct locators fetch
/// together, and the per-user MAC key derives while they are in flight (it
/// needs only the passphrase, and is cached for the session after the first
/// derivation). `max_bytes` rejects an oversized file before any key work.
pub(super) async fn open_file(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
    max_bytes: Option<i64>,
    emit: &(dyn Fn(Stage, u32, u32, i64, i64) + Sync),
) -> Result<OpenedFile, EngineError> {
    let is_space_mode = space_key.is_some();
    let join_err = |e: tokio::task::JoinError| EngineError::Other(format!("join: {e}"));

    // 1. Metadata. Retry the control-plane call: on a flaky/filtered network a
    //    single dropped request here used to kill the whole download before a
    //    byte moved (the "error sending request for url .../meta" failure). The
    //    detail() surfaces reqwest's hidden underlying cause if it still fails.
    //    Locators are owner-only, so a space read skips them and relays.
    emit(Stage::FetchingMeta, 0, 0, 0, 0);
    let mac_task = (!is_space_mode).then(|| {
        let pass = passphrase.to_string();
        let uid = user_id.to_string();
        tokio::task::spawn_blocking(move || crypto::derive_dedup_key_cached(&pass, &uid).to_vec())
    });
    let client = ctx.client.clone();
    let retry_client = client.clone();
    let meta_fut = client.with_retry(6, move || {
        let c = retry_client.clone();
        async move { c.get_file_meta(file_id).await }
    });
    let sources_fut = async {
        if is_space_mode {
            DirectSources::default()
        } else {
            resolve_direct_sources(ctx, file_id).await
        }
    };
    let (meta, sources) = tokio::join!(meta_fut, sources_fut);
    let meta = meta.map_err(|e| {
        let d = e.detail();
        // Full cause to stderr too: the UI toast truncates it, and this is
        // the one line that says WHY a flaky/filtered network is failing.
        eprintln!("zcrypt open {file_id}: metadata fetch failed after retries: {d}");
        EngineError::Other(format!("fetch metadata: {d}"))
    })?;

    if let Some(cap) = max_bytes {
        if meta.original_size > cap {
            return Err(EngineError::Other(format!(
                "file too large for in-memory decrypt: {} bytes (cap {cap})",
                meta.original_size
            )));
        }
    }

    let total = meta.chunk_count as u32;
    let b64 = base64::engine::general_purpose::STANDARD;
    let salt = b64
        .decode(&meta.salt)
        .map_err(|e| EngineError::Integrity(format!("salt b64: {e}")))?;
    let wrapped = if is_space_mode {
        None
    } else {
        crypto::WrappedKey::parse(&meta.wrapped_cek)?
    };
    if wrapped.as_ref().is_some_and(|w| w.is_mk1()) {
        super::ensure_master_key(ctx, passphrase).await?;
    }

    // 2. Key. `space_key` here is actually the file's ALREADY-RESOLVED content
    //    key, not the space's raw symmetric key: a shared file's CEK is wrapped
    //    under the space key in the SharedVaultFile record (a field the generic
    //    file-meta response above does NOT carry, meta.wrapped_cek is the
    //    OWNER's passphrase-wrapped envelope, a different ciphertext entirely).
    //    So the caller (lib/spaces.ts's spaceFileKey()) unwraps client-side
    //    using data it already holds and hands us the final key directly, this
    //    mirrors the web client's `resolveKey` override exactly (no unwrap
    //    happens here). Passphrase mode (PBKDF2, cached) is unchanged.
    emit(Stage::DerivingKey, 0, total, 0, meta.original_size);
    let key = if let Some(space_key) = space_key {
        space_key
    } else {
        let pass = passphrase.to_string();
        let fid = file_id.to_string();
        tokio::task::spawn_blocking(move || {
            crypto::resolve_file_key_cached(&fid, &pass, &salt, wrapped.as_ref())
        })
        .await
        .map_err(join_err)??
    };

    // Whole-file hasher + whether its result is actually comparable against
    // meta.sha256. hmac_v1 files store a per-user KEYED MAC there, which needs
    // the passphrase (owner/folder path) to recompute: a space download has no
    // passphrase, so it CANNOT verify that MAC. Mirrors the web client's
    // canVerifyHash exactly (lib/download-session.ts): still hash (falling back
    // to plain SHA-256) for uniform per-chunk work, but skip the final
    // comparison rather than derive a MAC key from nothing, which would just
    // produce a value that can never match and make every hmac_v1 space file
    // spuriously "fail" integrity. Per-chunk SHA-256 (already verified during
    // fetch) plus the chunk-count assertion (ordered_writer::drain) are what
    // space/share downloads rely on instead: same trust level as the
    // public-share path.
    let mac_key = match mac_task {
        _ if meta.sha256_scheme == crate::pk1::CEK_MAC_SCHEME => {
            Some(crate::pk1::cek_mac_key(&key).to_vec())
        }
        Some(task) if meta.sha256_scheme == "hmac_v1" => Some(task.await.map_err(join_err)?),
        _ => None,
    };
    let can_verify_hash = crypto::can_verify_whole_file_hash(&meta.sha256_scheme, is_space_mode);
    let hasher = match &mac_key {
        Some(k) => ContentHasher::new("hmac_v1", Some(k)),
        None => ContentHasher::new("plain", None),
    };
    // HMAC's new_from_slice() above already copied the key into its own
    // internal state: this caller-side copy is no longer needed.
    if let Some(mut mk) = mac_key {
        mk.zeroize();
    }

    Ok(OpenedFile {
        meta,
        key,
        hasher,
        can_verify_hash,
        sources,
    })
}

#[cfg(test)]
mod transfer_tests {
    use super::*;
    use crate::engines::gate::fake::{gate, FakeEnv};
    use crate::testutil::{serve, Reply};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    #[tokio::test]
    async fn a_slow_platform_is_not_blacklisted_as_unreachable() {
        let (base, _) = serve(|_, _| Reply::Hang).await;
        let http = reqwest::Client::builder()
            .read_timeout(Duration::from_millis(100))
            .build()
            .unwrap();
        let err = http.get(&base).send().await.unwrap_err();
        assert!(err.is_timeout());
        assert!(!is_unreachable(&AdapterError::from(err)));
    }

    #[tokio::test]
    async fn a_refused_connection_is_unreachable() {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        drop(l);
        let err = reqwest::get(format!("http://{addr}")).await.unwrap_err();
        assert!(is_unreachable(&AdapterError::from(err)));
    }

    fn sources_with(locs: Vec<(i64, &str, i64)>, owned: &[&str]) -> DirectSources {
        let locs = locs
            .into_iter()
            .map(|(idx, platform, size)| {
                (
                    idx,
                    ChunkLocator {
                        index: idx,
                        platform: platform.into(),
                        size,
                        ..ChunkLocator::default()
                    },
                )
            })
            .collect();
        let adapters = owned
            .iter()
            .map(|p| {
                (
                    p.to_string(),
                    Arc::new(Direct(vec![])) as Arc<dyn PlatformAdapter>,
                )
            })
            .collect();
        (locs, adapters)
    }

    #[test]
    fn only_chunks_with_no_direct_route_or_link_count_as_server_only() {
        let s = sources_with(
            vec![
                (0, "telegram", 10),
                (1, "huggingface", 20),
                (2, "github", 30),
                (3, "telegram", 40),
            ],
            &[],
        );
        assert_eq!(
            server_only_bytes(&s, 4, 400),
            50,
            "the two pool Telegram chunks"
        );
        let owned = sources_with(vec![(0, "telegram", 10)], &["telegram"]);
        assert_eq!(
            server_only_bytes(&owned, 1, 10),
            0,
            "own Telegram goes direct"
        );
        let unknown = sources_with(vec![], &[]);
        assert_eq!(
            server_only_bytes(&unknown, 4, 400),
            400,
            "no locators: average size each"
        );
        assert_eq!(server_only_bytes(&unknown, 0, 0), 0);
    }

    /// A server whose /link answers with `link(base)`; counts link, blob and
    /// relay requests apart.
    async fn link_server(
        link: impl Fn(&str) -> Reply + Send + Sync + 'static,
        blob: impl Fn() -> Reply + Send + Sync + 'static,
    ) -> (String, [Arc<std::sync::atomic::AtomicUsize>; 3]) {
        use std::sync::atomic::AtomicUsize;
        let counts = [
            Arc::new(AtomicUsize::new(0)),
            Arc::new(AtomicUsize::new(0)),
            Arc::new(AtomicUsize::new(0)),
        ];
        let base_cell = Arc::new(std::sync::Mutex::new(String::new()));
        let (c, b) = (counts.clone(), base_cell.clone());
        let (base, _) = serve(move |_, req| {
            if req.path.ends_with("/link") {
                c[0].fetch_add(1, Ordering::SeqCst);
                link(&b.lock().unwrap())
            } else if req.path == "/blob" {
                c[1].fetch_add(1, Ordering::SeqCst);
                blob()
            } else {
                c[2].fetch_add(1, Ordering::SeqCst);
                Reply::with_header(200, "X-Chunk-SHA256", "", "relayed")
            }
        })
        .await;
        *base_cell.lock().unwrap() = base.clone();
        (base, counts)
    }

    fn link_json(base: &str, body: &[u8]) -> Reply {
        Reply::with_header(
            200,
            "Content-Type",
            "application/json",
            &format!(
                r#"{{"url":"{base}/blob","sha256":"{}","compressed":true}}"#,
                crypto::sha256_hex(body)
            ),
        )
    }

    #[tokio::test]
    async fn a_chunk_with_a_platform_link_is_read_from_it_not_the_relay() {
        let (base, [links, blobs, relays]) =
            link_server(|b| link_json(b, b"linked"), || Reply::status(200, "linked")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(true, true), None);
        let (data, compressed, _) = fetch_chunk(&client, &g, None, None, "f", 0).await.unwrap();
        assert_eq!(data, b"linked");
        assert!(compressed);
        assert_eq!(
            (
                links.load(Ordering::SeqCst),
                blobs.load(Ordering::SeqCst),
                relays.load(Ordering::SeqCst)
            ),
            (1, 1, 0)
        );
    }

    #[tokio::test]
    async fn a_chunk_with_no_link_goes_through_the_relay_without_turning_links_off() {
        let (base, [_, _, relays]) =
            link_server(|_| Reply::status(409, "{}"), || Reply::status(500, "")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(true, true), None);
        let (data, _, _) = fetch_chunk(&client, &g, None, None, "f", 0).await.unwrap();
        assert_eq!(data, b"relayed");
        assert_eq!(relays.load(Ordering::SeqCst), 1);
        assert_eq!(g.link_failures.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn links_turn_off_after_two_chunks_in_a_row_fail() {
        let (base, [links, blobs, _]) =
            link_server(|b| link_json(b, b"x"), || Reply::status(403, "expired")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(true, true), None);
        for idx in 0..2 {
            let (data, _, _) = fetch_chunk(&client, &g, None, None, "f", idx)
                .await
                .unwrap();
            assert_eq!(data, b"relayed");
        }
        assert_eq!(
            blobs.load(Ordering::SeqCst),
            4,
            "each chunk retries its read once"
        );
        let asked = links.load(Ordering::SeqCst);
        fetch_chunk(&client, &g, None, None, "f", 2).await.unwrap();
        assert_eq!(
            links.load(Ordering::SeqCst),
            asked,
            "no more links for this file"
        );
    }

    #[tokio::test]
    async fn a_relay_404_is_tried_once() {
        let (base, hits) = serve(|_, req| {
            if req.path.ends_with("/link") {
                Reply::status(409, "{}")
            } else {
                Reply::status(404, "gone")
            }
        })
        .await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let r = fetch_chunk(
            &client,
            &gate(FakeEnv::new(true, true), None),
            None,
            None,
            "f",
            0,
        )
        .await;
        assert!(r.is_err());
        assert_eq!(
            hits.load(Ordering::SeqCst),
            2,
            "the link ask, then one relay try"
        );
    }

    #[tokio::test]
    async fn cancel_stops_a_chunk_retry_loop_at_once() {
        let (base, _) = serve(|_, _| Reply::status(503, "busy")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(true, true), None);
        let trip = g.cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            trip.cancel();
        });
        let started = Instant::now();
        let r = fetch_chunk(&client, &g, None, None, "f", 0).await;
        assert!(matches!(r, Err(EngineError::Cancelled)));
        assert!(started.elapsed() < Duration::from_millis(300));
    }

    struct Direct(Vec<u8>);

    #[async_trait::async_trait]
    impl PlatformAdapter for Direct {
        fn platform_name(&self) -> &'static str {
            "telegram"
        }
        async fn create_repo(&self, _: &str) -> Result<String, AdapterError> {
            Err(AdapterError::NotFound("x".into()))
        }
        async fn upload(&self, _: &str, _: crate::types::Chunk) -> Result<ChunkRef, AdapterError> {
            Err(AdapterError::NotFound("x".into()))
        }
        async fn download(&self, _: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
            Ok(self.0.clone())
        }
        async fn delete(&self, _: &ChunkRef) -> Result<(), AdapterError> {
            Ok(())
        }
        async fn get_repo_size(&self, _: &str) -> Result<i64, AdapterError> {
            Ok(0)
        }
        async fn list_chunks(&self, _: &str) -> Result<Vec<ChunkRef>, AdapterError> {
            Ok(vec![])
        }
    }

    fn loc() -> ChunkLocator {
        serde_json::from_value(serde_json::json!({
            "index": 0, "platform": "telegram", "remote_path": "p",
            "size": 3, "sha256": "", "compressed": false
        }))
        .unwrap()
    }

    fn adapter() -> Option<Arc<dyn PlatformAdapter>> {
        Some(Arc::new(Direct(b"own".to_vec())))
    }

    #[tokio::test]
    async fn blocked_telegram_relays_when_the_rest_fits_the_allowance() {
        let (base, hits) = serve(|_, _| Reply::status(200, "relayed")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(false, true), None);
        let (data, _, _) = fetch_chunk(&client, &g, Some(loc()), adapter(), "f", 0)
            .await
            .unwrap();
        assert_eq!(data, b"relayed");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn blocked_telegram_with_no_allowance_waits_and_never_relays() {
        let (base, hits) = serve(|_, _| Reply::status(200, "relayed")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let env = FakeEnv::new(false, false);
        let seen = Arc::new(StdMutex::new(Vec::<&'static str>::new()));
        let s = seen.clone();
        let g = gate(
            env.clone(),
            Some(Arc::new(move |r| s.lock().unwrap().push(r))),
        );
        let e2 = env.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            e2.reachable.store(true, Ordering::SeqCst);
        });
        let (data, _, _) = fetch_chunk(&client, &g, Some(loc()), adapter(), "f", 0)
            .await
            .unwrap();
        assert_eq!(data, b"own");
        assert_eq!(hits.load(Ordering::SeqCst), 0);
        assert!(seen.lock().unwrap().contains(&"telegram_blocked"));
    }

    #[tokio::test]
    async fn waiting_for_telegram_stops_on_cancel() {
        let (base, hits) = serve(|_, _| Reply::status(200, "relayed")).await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let g = gate(FakeEnv::new(false, false), Some(Arc::new(|_| {})));
        let c = g.cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(60)).await;
            c.cancel();
        });
        let t = Instant::now();
        let r = fetch_chunk(&client, &g, Some(loc()), adapter(), "f", 0).await;
        assert!(matches!(r, Err(EngineError::Cancelled)));
        assert!(t.elapsed() < Duration::from_secs(2));
        assert_eq!(hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_relay_refusal_waits_then_goes_direct() {
        let (base, _) =
            serve(|_, _| Reply::status(403, r#"{"error":"x","code":"relay_daily_exceeded"}"#))
                .await;
        let client = Arc::new(Client::new(&base, "t", "r"));
        let env = FakeEnv::new(false, true);
        let seen = Arc::new(StdMutex::new(Vec::<&'static str>::new()));
        let s = seen.clone();
        let g = gate(
            env.clone(),
            Some(Arc::new(move |r| s.lock().unwrap().push(r))),
        );
        let e2 = env.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            e2.reachable.store(true, Ordering::SeqCst);
        });
        let (data, _, _) = fetch_chunk(&client, &g, Some(loc()), adapter(), "f", 0)
            .await
            .unwrap();
        assert_eq!(data, b"own");
        assert!(seen.lock().unwrap().contains(&"allowance_used_up"));
    }
}
