//! Background sync: port of `sidecar/pipeline/sync_worker.go`: drive each
//! pending ledger file through init → chunk push → complete, deleting staged
//! ciphertext once it's remote. State machine: pending → init_done →
//! uploading → synced (or error).

use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};

use async_trait::async_trait;
use base64::Engine as _;

use crate::adapters;
use crate::api::types::{ConfirmChunkRequest, UploadInitRequest};
use crate::api::Client;
use crate::localdb::{LocalChunk, LocalFile};
use crate::reppool::{self, RepoStore};
use crate::types::{Chunk, ChunkRef, Progress, RepoInfo, Stage, SyncStatus, UploadMode};

use super::gate::{self, Gate};
use super::{retry_transient, EngineContext, EngineError};
use crate::reach::{self, TELEGRAM_ORIGIN};

/// File ids currently being synced. Guards against the 1s `sync_once` loop and
/// an explicit `sync_file_by_id` call (from `upload()`, right after a file is
/// created) both grabbing the same file at once: two concurrent passes over
/// the same chunk list raced on deleting/reading the staging file
/// (`tokio::fs::remove_file` in one pass vs. `tokio::fs::read` in the other →
/// "No such file or directory"), and on the same upload session/chunk-index
/// server-side ("upload session is not active" / "failed to store chunk").
/// A file whose sync is already in flight is simply skipped for this pass:
/// the next 1s tick (or the explicit caller, which awaits the winner) tries
/// again once the guard clears.
fn in_flight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// RAII guard: reserves `file_id` for the duration of one sync pass, releasing
/// it on drop (including on early return / error) so a failed pass can retry
/// on the next tick instead of being permanently locked out.
struct SyncGuard(String);

impl SyncGuard {
    /// Returns None if `file_id` is already being synced by another pass.
    fn acquire(file_id: &str) -> Option<Self> {
        let mut set = in_flight().lock().unwrap();
        if set.contains(file_id) {
            return None;
        }
        set.insert(file_id.to_string());
        Some(SyncGuard(file_id.to_string()))
    }
}

impl Drop for SyncGuard {
    fn drop(&mut self) {
        in_flight().lock().unwrap().remove(&self.0);
    }
}

/// Files the relay refused for allowance, held back so the 1s loop does not
/// hammer the server until the hold lapses.
fn allowance_holds() -> &'static Mutex<std::collections::HashMap<String, std::time::Instant>> {
    static M: OnceLock<Mutex<std::collections::HashMap<String, std::time::Instant>>> =
        OnceLock::new();
    M.get_or_init(Default::default)
}

const ALLOWANCE_HOLD: std::time::Duration = std::time::Duration::from_secs(120);

fn on_hold(file_id: &str) -> bool {
    allowance_holds()
        .lock()
        .unwrap()
        .get(file_id)
        .is_some_and(|until| *until > std::time::Instant::now())
}

/// Decides whether a file may be pushed now. A Telegram file is pushed direct
/// while Telegram answers. If it does not: a file with no session yet moves to
/// the relay when it fits the allowance (sessions are bound to their plane and
/// pushed chunks are gone from staging, so a file mid-way cannot switch);
/// otherwise the file waits. `wait` is true for a foreground caller, which
/// blocks until Telegram is back; the background loop reports waiting and
/// skips the file for this pass. `Ok(false)` means skip.
async fn sync_gate(
    ctx: &EngineContext,
    gate: &Gate,
    f: &mut LocalFile,
    wait: bool,
) -> Result<bool, EngineError> {
    if f.mode != UploadMode::ByosDirect.as_str()
        || f.platform != crate::types::Platform::Telegram.as_str()
        || gate.env.reachable(TELEGRAM_ORIGIN).await
    {
        return Ok(true);
    }
    if f.sync_status == SyncStatus::Pending.as_str()
        && gate.env.fits(f.original_size, f.original_size).await
    {
        ctx.db
            .set_file_plane(&f.id, UploadMode::Relay.as_str(), "")?;
        f.mode = UploadMode::Relay.as_str().into();
        f.platform.clear();
        return Ok(true);
    }
    if !wait {
        if let Some(notify) = &gate.notify {
            notify(gate::WAIT_TELEGRAM_BLOCKED);
        }
        return Ok(false);
    }
    gate.wait_reachable(gate::WAIT_TELEGRAM_BLOCKED, TELEGRAM_ORIGIN)
        .await?;
    Ok(true)
}

fn file_gate(ctx: &EngineContext, f: &LocalFile) -> Gate {
    Gate::live(
        ctx,
        Some(Gate::waiting_progress(
            ctx,
            f.backend_file_id.clone(),
            f.original_name.clone(),
            f.original_size,
        )),
        f.original_size,
    )
}

/// One pass over every pending file (called by the 1s loop). Errors are
/// recorded per file/chunk in the ledger, never bubbled, the loop must
/// survive offline periods.
pub async fn sync_once(ctx: &EngineContext) {
    sync_pass(ctx, &|f| file_gate(ctx, f)).await
}

async fn sync_pass(ctx: &EngineContext, make_gate: &(dyn Fn(&LocalFile) -> Gate + Sync)) {
    let Ok(user_id) = ctx.client.user_id().await else {
        return;
    };
    let files = match ctx.db.get_pending_files(&user_id) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("sync: get pending files: {e}");
            return;
        }
    };
    for mut f in files {
        if on_hold(&f.id) {
            continue;
        }
        let Some(guard) = SyncGuard::acquire(&f.id) else {
            continue; // already being synced by another pass, skip this tick
        };
        let file_id = f.id.clone();
        match sync_gate(ctx, &make_gate(&f), &mut f, false).await {
            Ok(true) => {}
            _ => continue,
        }
        if let Err(e) = sync_file(ctx, f, None).await {
            // The backend collapsed a rare concurrent double-invocation (two
            // local rows for identical in-flight content. See
            // find_active_sibling's TOCTOU note) onto ONE session, and a
            // sibling pass finished it first: OUR session_id is now dead, but
            // OUR bytes were never uploaded under it. This is never "the
            // content is already safe" for THIS row, resolve it the only
            // deterministic way: drop the dead session and get this row a
            // genuinely fresh one next tick. (Never delete the row on a
            // content match: a user re-uploading identical bytes on purpose
            // must always get an independent new file, matching the backend's
            // own resume rule of only ever resuming an ACTIVE session.)
            if is_session_inactive_error(&e) {
                let _ = ctx.db.reset_file_for_retry(&file_id);
                eprintln!("sync: {file_id} lost its session to a concurrent pass, retrying fresh");
            } else {
                record_failure(ctx, &file_id, &e);
                eprintln!("sync: {e}");
            }
        }
        drop(guard);
    }
}

/// A failed pass that left the row in an in-flight state (the failure came
/// before any ledger error was written) would be retried every tick forever.
/// Put it on the ledger's backoff schedule instead, which ends in 'failed'.
fn record_failure(ctx: &EngineContext, file_id: &str, e: &EngineError) {
    let Ok(Some(row)) = ctx.db.get_file_by_id(file_id) else {
        return;
    };
    let errored = row.sync_status == SyncStatus::Error.as_str()
        || row.sync_status == SyncStatus::Failed.as_str();
    if !errored {
        let _ = ctx.db.update_file_sync_error(file_id, &e.to_string());
    }
}

/// Whether `e` is the backend's "upload session is not active" 400, the
/// signature of a session collision (this row's session was consumed/expired
/// out from under it), as opposed to a genuine failure (network, auth, disk).
fn is_session_inactive_error(e: &EngineError) -> bool {
    e.to_string().contains("upload session is not active")
}

/// Sync a single ledger file to genuine completion (used by `engines::upload`
/// and the shell's `sync_uploaded_file` command, right after `local_upload`
/// marks it pending: which the 1s `sync_once` loop can also pick up in the
/// same instant). Drives the file to a TERMINAL state and only then returns:
///
/// - `synced` in the ledger → Ok, whether our own pass got it there or the
///   background loop's did.
/// - the row disappears (the user deleted/cancelled the file mid-sync) → Ok:
///   nothing left to report on.
/// - our own pass fails `MAX_OWN_FAILURES` times → Err with the real error.
///
/// It must NOT sample the ledger once and report a non-terminal state
/// ("uploading", "pending") as failure, and it must NOT time out on a fixed
/// clock: a multi-GB file legitimately syncs for many minutes, and the old
/// 30s cap + single-sample readout showed "failed" for uploads that were
/// mid-flight and later completed fine.
pub async fn sync_file_by_id(
    ctx: &EngineContext,
    file_id: &str,
    platform: Option<&str>,
) -> Result<(), EngineError> {
    const MAX_OWN_FAILURES: u32 = 3;
    // Session collisions (see the is_session_inactive_error branch below) get
    // their own bounded counter: resetting for a fresh session is a restart,
    // not a failure, but it must still terminate if something pathological
    // kept returning this error forever instead of a real session.
    const MAX_SESSION_RESETS: u32 = 5;
    let mut own_failures = 0u32;
    let mut session_resets = 0u32;
    loop {
        let Some(f) = ctx.db.get_file_by_id(file_id)? else {
            return Ok(());
        };
        match f.sync_status.parse::<SyncStatus>() {
            Ok(SyncStatus::Synced) => return Ok(()),
            // Chunks still being staged by local_upload (a dedup'd duplicate
            // invocation lands here while the winner encrypts), wait, never
            // sync a partial chunk list.
            Ok(SyncStatus::Staging) => {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                continue;
            }
            _ => {}
        }
        let Some(guard) = SyncGuard::acquire(file_id) else {
            // Another pass (usually the 1s loop) owns this file right now:
            // wait and re-observe rather than racing it.
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            continue;
        };
        let mut f = f;
        let proceed = sync_gate(ctx, &file_gate(ctx, &f), &mut f, true).await;
        let result = match proceed {
            Ok(_) => sync_file(ctx, f, platform).await,
            Err(e) => Err(e),
        };
        drop(guard);
        match result {
            // Not necessarily terminal (e.g. nothing left to push this pass):
            // loop re-reads the ledger; if it's synced now, we return Ok above.
            Ok(()) => continue,
            Err(e @ (EngineError::Cancelled | EngineError::Blocked(_))) => return Err(e),
            Err(e) => {
                // A concurrent pass (see find_active_sibling's TOCTOU note)
                // finished this content's shared backend session before us.
                // OUR bytes never went through it. Never treat this as "the
                // content is safe" and never delete the row: get this row its
                // own fresh session and retry for real. This doesn't count
                // against own_failures: it's not a failure, just a restart,
                // but session_resets still bounds it so a pathological repeat
                // of this exact error can't loop forever.
                if is_session_inactive_error(&e) {
                    session_resets += 1;
                    if session_resets >= MAX_SESSION_RESETS {
                        return Err(e);
                    }
                    let _ = ctx.db.reset_file_for_retry(file_id);
                    continue;
                }
                own_failures += 1;
                if own_failures >= MAX_OWN_FAILURES {
                    return Err(e);
                }
                tokio::time::sleep(std::time::Duration::from_millis(500 << own_failures)).await;
            }
        }
    }
}

/// The relay refused this file for allowance: not a failure. A file with no
/// session goes back to the user's own Telegram when they hold a token (it
/// resumes direct once Telegram answers); either way it is held off the 1s loop.
fn hold_for_allowance(ctx: &EngineContext, f: &LocalFile) {
    if f.session_id.is_empty() {
        if let (_, Some(p)) = super::choose_plane(&ctx.creds) {
            let _ = ctx
                .db
                .set_file_plane(&f.id, UploadMode::ByosDirect.as_str(), p.as_str());
        }
    }
    allowance_holds()
        .lock()
        .unwrap()
        .insert(f.id.clone(), std::time::Instant::now() + ALLOWANCE_HOLD);
    (ctx.progress)(Progress {
        file_id: f.backend_file_id.clone(),
        file_name: f.original_name.clone(),
        stage: Stage::Waiting,
        chunks_done: 0,
        chunks_total: 0,
        bytes_done: 0,
        bytes_total: f.original_size,
        speed: 0.0,
        waiting: Some(gate::WAIT_ALLOWANCE_USED_UP.into()),
    });
}

async fn sync_file(
    ctx: &EngineContext,
    mut f: LocalFile,
    platform: Option<&str>,
) -> Result<(), EngineError> {
    // Defense in depth: never sync a row whose chunks are still being staged.
    // get_pending_files excludes 'staging' and sync_file_by_id waits it out, so
    // reaching here with one is a caller bug: skip the pass, don't corrupt it.
    if f.sync_status == SyncStatus::Staging.as_str() {
        return Ok(());
    }
    if f.sync_status == SyncStatus::Pending.as_str() {
        match init_remote_session(ctx, &f, platform).await {
            Ok((session_id, backend_id, plat, repo_url, direct)) => {
                ctx.db.update_file_sync_state(
                    &f.id,
                    SyncStatus::InitDone.as_str(),
                    &session_id,
                    &backend_id,
                    &plat,
                    &repo_url,
                    direct,
                )?;
                f.session_id = session_id;
                f.backend_file_id = backend_id;
                f.direct_upload = direct;
                f.sync_status = SyncStatus::InitDone.to_string();
            }
            Err(e) if gate::is_allowance_refusal(&e) => {
                hold_for_allowance(ctx, &f);
                return Ok(());
            }
            Err(e) => {
                let _ = ctx
                    .db
                    .update_file_sync_error(&f.id, &format!("init failed: {e}"));
                return Err(e);
            }
        }
    }

    if f.session_id.is_empty() {
        // Lost the session somehow: reset and retry next pass.
        ctx.db
            .update_file_sync_status(&f.id, SyncStatus::Pending.as_str())?;
        return Ok(());
    }

    ctx.db
        .update_file_sync_status(&f.id, SyncStatus::Uploading.as_str())?;
    // Unsynced = pending AND error: a chunk that errored on an earlier pass is
    // retried here (its staging file still exists; staging is only deleted
    // after a successful push). get_pending_chunks would strand errored chunks
    // forever: nothing else ever resets them.
    let chunks = ctx.db.get_unsynced_chunks(&f.id)?;
    let total = f.chunk_count as u32;
    let already = total.saturating_sub(chunks.len() as u32);

    // byos-direct resolves (and may CREATE) the destination repo once, up front:
    // doing that per-chunk inside the concurrent tasks below would race N
    // chunks into N near-simultaneous get_or_create_repo calls and could create
    // N repos for one file.
    let byos_repo = if f.mode == UploadMode::ByosDirect.as_str() {
        Some(resolve_byos_repo(ctx, &f.platform).await?)
    } else {
        None
    };

    // Push chunks CONCURRENTLY (bounded by the profile's worker count), the
    // previous one-at-a-time loop was the actual reason uploads felt no faster
    // than the old browser pipeline (which uploaded in parallel via a
    // semaphore). Network-bound work, so this is a straight latency win: N
    // chunks in flight instead of 1.
    let sem = Arc::new(tokio::sync::Semaphore::new(ctx.profile.effective_workers()));
    let done = Arc::new(std::sync::atomic::AtomicU32::new(already));
    let first_err: Arc<Mutex<Option<EngineError>>> = Arc::new(Mutex::new(None));
    let mut join: tokio::task::JoinSet<()> = tokio::task::JoinSet::new();

    for chunk in chunks.into_iter() {
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        let ctx = ctx.clone();
        let f_id = f.id.clone();
        let f_session = f.session_id.clone();
        let f_backend_id = f.backend_file_id.clone();
        let f_name = f.original_name.clone();
        let f_direct = f.direct_upload;
        let f_mode = f.mode.clone();
        let f_platform = f.platform.clone();
        let f_size = f.original_size;
        let f_count = f.chunk_count;
        let byos_repo = byos_repo.clone();
        let done = done.clone();
        let first_err = first_err.clone();
        join.spawn(async move {
            let _permit = permit;
            // A sibling task already failed. Don't push more bytes for a file
            // this pass is about to error out on (they'll retry next pass).
            if first_err.lock().unwrap().is_some() {
                return;
            }
            let stub = LocalFile {
                id: f_id,
                session_id: f_session,
                backend_file_id: f_backend_id,
                original_name: f_name.clone(),
                direct_upload: f_direct,
                mode: f_mode,
                platform: f_platform,
                original_size: f_size,
                chunk_count: f_count,
                ..Default::default()
            };
            let result = match &byos_repo {
                Some(repo) => push_chunk_byos_with_repo(&ctx, &stub, &chunk, repo).await,
                None => push_chunk(&ctx, &stub, &chunk).await,
            };
            match result {
                Ok(()) => {
                    let _ = tokio::fs::remove_file(&chunk.staging_path).await;
                    let n = done.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    (ctx.progress)(Progress {
                        file_id: stub.backend_file_id,
                        file_name: f_name,
                        stage: Stage::Uploading,
                        chunks_done: n,
                        chunks_total: f_count as u32,
                        bytes_done: (n as i64) * (f_size / f_count.max(1)),
                        bytes_total: f_size,
                        speed: 0.0,
                        waiting: None,
                    });
                }
                Err(e) => {
                    let _ = ctx.db.update_chunk_error(&chunk.id, &e.to_string());
                    *first_err.lock().unwrap() = Some(e);
                }
            }
        });
    }
    while join.join_next().await.is_some() {}

    if let Some(e) = first_err.lock().unwrap().take() {
        if gate::is_direct_unreachable(&e) {
            reach::shared().mark_blocked(TELEGRAM_ORIGIN);
            return Ok(());
        }
        if gate::is_allowance_refusal(&e) {
            hold_for_allowance(ctx, &f);
            return Ok(());
        }
        let _ = ctx
            .db
            .update_file_sync_error(&f.id, &format!("chunk push: {e}"));
        return Err(e);
    }

    if !ctx.db.all_chunks_synced(&f.id)? {
        return Ok(()); // some chunks errored: retried next pass after reset
    }

    (ctx.progress)(Progress {
        file_id: f.backend_file_id.clone(),
        file_name: f.original_name.clone(),
        stage: Stage::Finalizing,
        chunks_done: total,
        chunks_total: total,
        bytes_done: f.original_size,
        bytes_total: f.original_size,
        speed: 0.0,
        waiting: None,
    });
    let (enc, comp) = ctx.db.get_chunk_totals(&f.id)?;
    ctx.client.complete_upload(&f.session_id, enc, comp).await?;
    ctx.db
        .update_file_sync_status(&f.id, SyncStatus::Synced.as_str())?;
    Ok(())
}

/// Ledger garbage collection. Run once when the sync worker starts. Cleans
/// the two kinds of debris a crashed encrypt-in-progress leaves behind:
///
/// 1. Dead 'staging' rows: their encrypting process died (the CEK lived only
///    in its memory), so they can never complete. They only shadow future
///    uploads of the same content via dedup and pin staged ciphertext forever.
/// 2. Staging-dir files referenced by no chunk row (crash leftovers). Files
///    younger than an hour are skipped: local_upload writes the staging file
///    BEFORE inserting its chunk row, so a fresh unreferenced file may be a
///    live write, not garbage.
///
/// Deliberately does NOT purge rows whose content matches an already-synced
/// sibling: re-uploading identical bytes on purpose must always land as an
/// independent new file (matching the backend's own resume rule, which only
/// ever resumes an ACTIVE session); see `is_session_inactive_error` in
/// `sync_once`/`sync_file_by_id` for the one place a session collision IS
/// handled, and why it resets-and-retries rather than deleting.
pub async fn gc_ledger(ctx: &EngineContext) {
    if let Ok(rows) = ctx.db.list_files_in_status(SyncStatus::Staging.as_str()) {
        for f in rows {
            if super::local_upload::is_staging_live(&f.id) {
                continue;
            }
            if let Ok(paths) = ctx.db.get_staging_paths(&f.id) {
                for p in paths {
                    let _ = tokio::fs::remove_file(&p).await;
                }
            }
            let _ = ctx.db.delete_file(&f.id);
            eprintln!(
                "sync gc: purged dead staging row {} ({})",
                f.id, f.original_name
            );
        }
    }

    let (Ok(dir), Ok(referenced)) = (crate::localdb::staging_dir(), ctx.db.all_staging_paths())
    else {
        return;
    };
    let Ok(mut entries) = tokio::fs::read_dir(&dir).await else {
        return;
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    let mut orphans = 0u64;
    while let Ok(Some(ent)) = entries.next_entry().await {
        let path = ent.path();
        if referenced.contains(&path.to_string_lossy().to_string()) {
            continue;
        }
        let Ok(meta) = ent.metadata().await else {
            continue;
        };
        if meta.modified().map(|m| m < cutoff).unwrap_or(false)
            && tokio::fs::remove_file(&path).await.is_ok()
        {
            orphans += 1;
        }
    }
    if orphans > 0 {
        eprintln!("sync gc: removed {orphans} orphaned staging file(s)");
    }
}

async fn init_remote_session(
    ctx: &EngineContext,
    f: &LocalFile,
    platform: Option<&str>,
) -> Result<(String, String, String, String, bool), EngineError> {
    let b64 = base64::engine::general_purpose::STANDARD;
    // byos-direct: the client owns placement: send the chosen platform + mode so
    // the server creates a metadata-only session (no server repo). Relay leaves
    // mode empty and lets the server pick + create the repo.
    let mode = if f.mode == UploadMode::ByosDirect.as_str() {
        UploadMode::ByosDirect
    } else {
        UploadMode::Relay
    };
    let byos = mode == UploadMode::ByosDirect;
    if f.encrypted_name.is_empty() || f.sha256_scheme != crate::crypto::CONTENT_MAC_SCHEME {
        return Err(EngineError::Other(
            "this file was staged by an older version and its name and hash are not sealed; \
             upload it again"
                .into(),
        ));
    }
    let req = UploadInitRequest {
        original_size: f.original_size,
        salt: b64.encode(&f.salt),
        wrapped_cek: b64.encode(&f.wrapped_cek),
        chunk_count: f.chunk_count,
        platform: if byos {
            f.platform.clone()
        } else {
            platform.unwrap_or(&f.platform).to_string()
        },
        mode: mode.init_field().to_string(),
        ..Default::default()
    }
    .with_identity(f.encrypted_name.clone(), f.sha256.clone());
    let resp = ctx.client.init_upload(&req).await?;
    Ok((
        resp.session_id,
        resp.file_id,
        resp.platform,
        resp.repo_url,
        resp.direct_upload,
    ))
}

/// Relay-path chunk push (server stages + pushes, or presigned-direct for
/// HuggingFace). The byos-direct branch is handled separately by the caller:
/// see [`resolve_byos_repo`] + [`push_chunk_byos_with_repo`], because
/// byos-direct's repo must be resolved ONCE for the whole file, not per-chunk.
async fn push_chunk(
    ctx: &EngineContext,
    f: &LocalFile,
    chunk: &LocalChunk,
) -> Result<(), EngineError> {
    let data = bytes::Bytes::from(tokio::fs::read(&chunk.staging_path).await?);

    let remote_path = if f.direct_upload {
        // Presigned direct path (HuggingFace LFS): presign → external PUT → confirm.
        let presign = retry_transient(&ctx.cancel, 4, || async {
            ctx.client
                .presign_chunk(&f.session_id, chunk.idx, &chunk.sha256, data.len() as i64)
                .await
                .map_err(EngineError::from)
        })
        .await?;
        if !presign.already_exists {
            retry_transient(&ctx.cancel, 4, || async {
                ctx.client
                    .direct_upload_to_url(
                        &presign.upload_url,
                        &presign.upload_headers,
                        data.clone(),
                    )
                    .await
                    .map_err(EngineError::from)
            })
            .await?;
        }
        super::confirm_chunk(
            ctx,
            &f.session_id,
            chunk.idx,
            &ConfirmChunkRequest {
                sha256: chunk.sha256.clone(),
                size: chunk.encrypted_size,
                remote_path: presign.remote_path.clone(),
                compressed: chunk.compressed,
                ..Default::default()
            },
            None,
        )
        .await?;
        presign.remote_path
    } else {
        // Relay path: the server stages + pushes to the platform.
        retry_transient(&ctx.cancel, 4, || async {
            ctx.client
                .upload_chunk(
                    &f.session_id,
                    chunk.idx,
                    data.clone(),
                    &chunk.sha256,
                    chunk.compressed,
                )
                .await
                .map_err(EngineError::from)
        })
        .await?;
        String::new()
    };

    ctx.db.update_chunk_synced(&chunk.id, &remote_path)?;
    Ok(())
}

/// Resolve (creating if needed) the ONE destination repo for a byos-direct
/// file, up front, before any chunk push. Chunks then share this repo via
/// [`push_chunk_byos_with_repo`] rather than each independently calling
/// `get_or_create_repo`, which: now that chunk pushes run concurrently:
/// would otherwise race N chunks into creating up to N repos for one file.
pub(super) async fn resolve_byos_repo(
    ctx: &EngineContext,
    platform: &str,
) -> Result<RepoInfo, EngineError> {
    let creds = (ctx.creds)(platform)
        .ok_or_else(|| EngineError::Other(format!("no personal token for {platform}")))?;
    let adapter = adapters::shared_adapter(platform, &creds.token, &creds.account)
        .ok_or_else(|| EngineError::Other(format!("no adapter for {platform}")))?;

    // Client-side pool over the control plane: list/register repos through the
    // backend so locators + usage stay consistent, but create them on the user's
    // own platform with the user's own token.
    let store = ApiRepoStore {
        client: ctx.client.clone(),
    };
    let pool = reppool::Pool {
        adapter: adapter.as_ref(),
        store: &store,
        account: creds.account.clone(),
        threshold: reppool::default_threshold(platform),
    };
    pool.get_or_create_repo()
        .await
        .map_err(|e| EngineError::Other(format!("repo: {e}")))
}

/// byos-direct chunk push against an ALREADY-RESOLVED repo (see
/// [`resolve_byos_repo`]): upload the ciphertext with the user's OWN adapter +
/// token, then confirm metadata (committed = TRUE, git/Telegram commit
/// atomically and the HF adapter does LFS+commit before returning). The server
/// never handles the bytes.
async fn push_chunk_byos_with_repo(
    ctx: &EngineContext,
    f: &LocalFile,
    chunk: &LocalChunk,
    repo: &RepoInfo,
) -> Result<(), EngineError> {
    let creds = (ctx.creds)(&f.platform)
        .ok_or_else(|| EngineError::Other(format!("no personal token for {}", f.platform)))?;
    let adapter = adapters::shared_adapter(&f.platform, &creds.token, &creds.account)
        .ok_or_else(|| EngineError::Other(format!("no adapter for {}", f.platform)))?;

    let data = bytes::Bytes::from(tokio::fs::read(&chunk.staging_path).await?);
    let cref = ChunkRef {
        platform: f.platform.clone(),
        account: creds.account.clone(),
        index: chunk.idx as i32,
        sha256: chunk.sha256.clone(),
        compressed: chunk.compressed,
        ..ChunkRef::default()
    };
    // Push to the user's OWN platform, retrying transient failures only. NOTE:
    // this is intra-plane (byos) resilience only. A true byos-direct -> relay
    // fallback needs a BACKEND change first: a byos-direct session has no
    // server repo (RepoURL empty) and uses the user's personal token, so the
    // relay HandleChunkUpload path can't currently complete its chunks.
    let uploaded = retry_transient(&ctx.cancel, 4, || async {
        adapter
            .upload(
                &repo.url,
                Chunk {
                    r#ref: cref.clone(),
                    data: data.clone(),
                },
            )
            .await
            .map_err(EngineError::from)
    })
    .await?;

    super::confirm_chunk(
        ctx,
        &f.session_id,
        chunk.idx,
        &ConfirmChunkRequest {
            sha256: chunk.sha256.clone(),
            size: chunk.encrypted_size,
            remote_path: uploaded.remote_path.clone(),
            compressed: chunk.compressed,
            platform: f.platform.clone(),
            account: creds.account.clone(),
            repo_id: repo.id.clone(),
            committed: true,
        },
        Some((adapter.as_ref(), &uploaded)),
    )
    .await?;

    ctx.db
        .update_chunk_synced(&chunk.id, &uploaded.remote_path)?;
    Ok(())
}

/// A `reppool::RepoStore` backed by the control-plane API: repos are listed and
/// registered through the backend (so locators + usage stay authoritative) but
/// physically created on the user's own platform by the caller's adapter.
struct ApiRepoStore {
    client: Arc<Client>,
}

#[async_trait]
impl RepoStore for ApiRepoStore {
    async fn list_repos(&self, platform: &str, account: &str) -> Result<Vec<RepoInfo>, String> {
        let repos = self
            .client
            .list_repos(platform)
            .await
            .map_err(|e| e.to_string())?;
        Ok(repos
            .into_iter()
            .filter(|r| r.platform == platform && r.account == account && r.active)
            .collect())
    }

    async fn register_repo(&self, repo: &RepoInfo) -> Result<(), String> {
        self.client
            .register_repo(repo)
            .await
            .map_err(|e| e.to_string())
    }

    async fn update_usage(&self, _repo_id: &str, _additional_bytes: i64) -> Result<(), String> {
        // The backend credits usage from the confirmed chunk size (BumpRepoUsage),
        // so the client doesn't double-report it.
        Ok(())
    }

    async fn deactivate_repo(&self, repo_id: &str) -> Result<(), String> {
        // Mark the full repo inactive via the control plane so the next
        // get_or_create_repo rotates to a fresh repo instead of continuing to
        // write past the soft threshold. Telegram/HF are effectively unbounded,
        // but git repos (GitHub 850MB / GitLab 9GB) genuinely need this.
        self.client
            .deactivate_repo(repo_id)
            .await
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    use crate::localdb::LocalDb;
    use crate::profiles;

    #[tokio::test]
    async fn a_row_staged_before_name_sealing_is_not_sent_to_the_server() {
        let dir = std::env::temp_dir().join(format!("zcrypt-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new("http://127.0.0.1:0", "", "")),
            db: Arc::new(LocalDb::open_at(&dir.join("db.sqlite")).unwrap()),
            profile: profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        };
        let legacy = LocalFile {
            original_name: "plain-name.txt".into(),
            sha256: "ab".repeat(32),
            ..Default::default()
        };
        let err = init_remote_session(&ctx, &legacy, None).await.unwrap_err();
        assert!(err.to_string().contains("not sealed"));
        let _ = std::fs::remove_dir_all(dir);
    }

    fn token_for(sub: &str) -> String {
        use base64::Engine as _;
        let b = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!(
            "{}.{}.sig",
            b.encode("{}"),
            b.encode(format!(r#"{{"sub":"{sub}"}}"#))
        )
    }

    #[tokio::test]
    async fn a_pass_that_fails_before_any_chunk_goes_on_the_backoff_schedule() {
        let dir = std::env::temp_dir().join(format!("zcrypt-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Arc::new(LocalDb::open_at(&dir.join("db.sqlite")).unwrap());
        db.insert_file(&LocalFile {
            id: "f1".into(),
            original_name: "a".into(),
            salt: vec![1; 32],
            chunk_count: 1,
            user_id: "u1".into(),
            mode: UploadMode::ByosDirect.as_str().into(),
            platform: "telegram".into(),
            ..Default::default()
        })
        .unwrap();
        db.update_file_sync_state(
            "f1",
            SyncStatus::Uploading.as_str(),
            "s1",
            "b1",
            "telegram",
            "",
            false,
        )
        .unwrap();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new(
                "http://127.0.0.1:0",
                &token_for("u1"),
                "r",
            )),
            db: db.clone(),
            profile: profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        };

        sync_pass(&ctx, &|_| {
            gate::fake::gate(gate::fake::FakeEnv::new(true, true), None)
        })
        .await;
        let row = db.get_file_by_id("f1").unwrap().unwrap();
        assert_eq!(row.sync_status, SyncStatus::Error.as_str());
        assert!(!row.error_msg.is_empty());

        sync_pass(&ctx, &|_| {
            gate::fake::gate(gate::fake::FakeEnv::new(true, true), None)
        })
        .await;
        let again = db.get_file_by_id("f1").unwrap().unwrap();
        assert_eq!(again.sync_status, SyncStatus::Error.as_str());
        assert_eq!(db.get_pending_files("u1").unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn pending_telegram_file(
        dir: &std::path::Path,
        base: &str,
    ) -> (EngineContext, Arc<LocalDb>, String) {
        let id = uuid::Uuid::new_v4().to_string();
        let db = Arc::new(LocalDb::open_at(&dir.join("db.sqlite")).unwrap());
        db.insert_file(&LocalFile {
            id: id.clone(),
            original_name: "a".into(),
            original_size: 10,
            salt: vec![1; 32],
            chunk_count: 1,
            user_id: "u1".into(),
            encrypted_name: "enc".into(),
            sync_status: SyncStatus::Pending.to_string(),
            sha256_scheme: crate::crypto::CONTENT_MAC_SCHEME.into(),
            mode: UploadMode::ByosDirect.as_str().into(),
            platform: "telegram".into(),
            ..Default::default()
        })
        .unwrap();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new(base, &token_for("u1"), "r")),
            db: db.clone(),
            profile: profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        };
        (ctx, db, id)
    }

    #[tokio::test]
    async fn a_blocked_telegram_file_over_the_allowance_is_skipped_not_failed() {
        let (base, hits) =
            crate::testutil::serve(|_, _| crate::testutil::Reply::status(500, "x")).await;
        let dir = std::env::temp_dir().join(format!("zcrypt-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let (ctx, db, id) = pending_telegram_file(&dir, &base);
        let seen = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let s = seen.clone();
        sync_pass(&ctx, &|_| {
            gate::fake::gate(
                gate::fake::FakeEnv::new(false, false),
                Some(Arc::new({
                    let s = s.clone();
                    move |r| s.lock().unwrap().push(r)
                })),
            )
        })
        .await;
        let row = db.get_file_by_id(&id).unwrap().unwrap();
        assert_eq!(row.sync_status, SyncStatus::Pending.as_str());
        assert!(row.error_msg.is_empty(), "{}", row.error_msg);
        assert_eq!(row.sync_status, SyncStatus::Pending.as_str());
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert!(seen.lock().unwrap().contains(&"telegram_blocked"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_blocked_telegram_file_that_fits_moves_to_the_relay() {
        let bodies = Arc::new(Mutex::new(Vec::<String>::new()));
        let b = bodies.clone();
        let (base, _) = crate::testutil::serve(move |_, req| {
            b.lock()
                .unwrap()
                .push(String::from_utf8_lossy(&req.body).into());
            crate::testutil::Reply::status(500, "x")
        })
        .await;
        let dir = std::env::temp_dir().join(format!("zcrypt-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let (ctx, db, id) = pending_telegram_file(&dir, &base);
        sync_pass(&ctx, &|_| {
            gate::fake::gate(gate::fake::FakeEnv::new(false, true), None)
        })
        .await;
        let row = db.get_file_by_id(&id).unwrap().unwrap();
        assert_eq!(row.mode, UploadMode::Relay.as_str());
        let b = bodies.lock().unwrap();
        assert!(!b.is_empty() && !b[0].contains("byos-direct"), "{b:?}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_relay_refusal_on_init_is_held_not_failed() {
        let (base, hits) = crate::testutil::serve(|_, _| {
            crate::testutil::Reply::status(403, r#"{"error":"x","code":"relay_daily_exceeded"}"#)
        })
        .await;
        let dir = std::env::temp_dir().join(format!("zcrypt-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let (mut ctx, db, id) = pending_telegram_file(&dir, &base);
        db.set_file_plane(&id, "relay", "").unwrap();
        ctx.creds = Arc::new(|p| {
            (p == "telegram").then(|| crate::engines::PlatformCreds {
                token: "t".into(),
                account: "a".into(),
            })
        });
        let g = || gate::fake::gate(gate::fake::FakeEnv::new(true, true), None);
        sync_pass(&ctx, &|_| g()).await;
        let row = db.get_file_by_id(&id).unwrap().unwrap();
        assert!(row.error_msg.is_empty(), "{}", row.error_msg);
        assert_eq!(row.sync_status, SyncStatus::Pending.as_str());
        assert_eq!(row.mode, UploadMode::ByosDirect.as_str());
        let first = hits.load(std::sync::atomic::Ordering::SeqCst);
        sync_pass(&ctx, &|_| g()).await;
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            first,
            "held off the server"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
