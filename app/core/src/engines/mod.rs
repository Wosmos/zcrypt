//! Pipeline engines — the client work: local-first upload, background sync,
//! network upload, streaming download. Ports of `sidecar/pipeline/*` with two
//! deliberate upgrades: the download STREAMS to disk through a bounded reorder
//! buffer (the Go engine buffered whole files — a mobile OOM), and `upload()`
//! is local-first (encrypt→ledger, then drive one sync pass) so the two upload
//! paths can never drift.

mod decrypt_to_memory;
mod delete;
mod download;
mod local_upload;
pub mod ordered_writer;
mod pipeline;
mod sync;

use std::path::Path;
use std::sync::Arc;

use crate::api::Client;
use crate::localdb::{LocalDb, SyncStats};
use crate::profiles::Profile;
use crate::types::ProgressFn;

pub use pipeline::ProcessedChunk;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("api: {0}")]
    Api(#[from] crate::api::ApiError),
    #[error("db: {0}")]
    Db(#[from] crate::localdb::DbError),
    #[error("crypto: {0}")]
    Crypto(#[from] crate::crypto::CryptoError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("integrity: {0}")]
    Integrity(String),
    #[error("{0}")]
    Other(String),
}

/// The user's own credentials for a storage platform, sourced from the OS
/// keychain by the shell. Used ONLY for byos-direct transfers with the user's
/// own token — never the managed-pool token, which stays server-side.
#[derive(Clone)]
pub struct PlatformCreds {
    pub token: String,
    pub account: String,
}

/// Resolves the user's own credentials for a platform id (`github` / `gitlab` /
/// `telegram` / `huggingface`), or `None` when the user hasn't connected it (the
/// engine then falls back to the server-managed relay path).
pub type CredProvider = Arc<dyn Fn(&str) -> Option<PlatformCreds> + Send + Sync>;

/// A `CredProvider` that yields nothing — relay-only (web-style) operation, and
/// the default for tests and the managed data plane.
pub fn no_creds() -> CredProvider {
    Arc::new(|_platform| None)
}

/// byos-direct platform preference, mirroring the backend's Auto order
/// (`cmd/server.go` adapterPreferenceOrder): Telegram first (effectively
/// unbounded, the primary backend), then the git platforms, HuggingFace last.
const BYOS_PREFERENCE: [&str; 4] = ["telegram", "github", "gitlab", "huggingface"];

/// Decide the data plane for a new upload. If the device holds the user's own
/// token for a supported platform, upload byos-direct to that platform (client
/// owns placement); otherwise relay through the server, which picks + manages
/// the repo. Returns `(mode, platform)` — platform is empty for relay.
pub(crate) fn choose_plane(creds: &CredProvider) -> (String, String) {
    for p in BYOS_PREFERENCE {
        if creds(p).is_some() {
            return ("byos-direct".to_string(), p.to_string());
        }
    }
    ("relay".to_string(), String::new())
}

/// Everything an engine call needs. The Tauri shell constructs one per
/// operation; `progress` forwards to the webview as window events, and `creds`
/// hands out the user's own platform tokens for byos-direct.
pub struct EngineContext {
    pub client: Arc<Client>,
    pub db: Arc<LocalDb>,
    pub profile: Profile,
    pub progress: ProgressFn,
    pub creds: CredProvider,
}

/// Encrypt a file into the local ledger + staging dir (no network). Returns
/// the local file id; the sync worker (or `upload`) pushes it later.
pub async fn local_upload(
    ctx: &EngineContext,
    file_path: &Path,
    passphrase: &str,
) -> Result<String, EngineError> {
    local_upload::run(ctx, file_path, passphrase).await
}

/// Network upload: local-first encrypt, then drive one sync pass for that file
/// so the bytes are on the backend/platform when this returns.
pub async fn upload(
    ctx: &EngineContext,
    file_path: &Path,
    passphrase: &str,
    platform: Option<String>,
) -> Result<(), EngineError> {
    let file_id = local_upload::run(ctx, file_path, passphrase).await?;
    sync::sync_file_by_id(ctx, &file_id, platform.as_deref()).await
}

/// Streaming download: fetch → verify → decrypt → decompress → ordered write
/// to disk → whole-file integrity check → atomic rename.
///
/// `space_key` is `None` for the normal owner/folder path (passphrase-derived
/// key, as before). Pass `Some(key)` to download a shared-space file — despite
/// the name, `key` must be the file's ALREADY-RESOLVED content key (the
/// space-wrapped CEK, unwrapped client-side by the caller against the
/// `SharedVaultFile` record it holds), NOT the space's raw symmetric key: the
/// generic file-meta this fetches carries the OWNER's passphrase-wrapped CEK,
/// a different ciphertext the space key can't unwrap. See [`download::run`]
/// for what space mode also changes about integrity verification.
pub async fn download(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
    save_path: &Path,
) -> Result<(), EngineError> {
    download::run(ctx, file_id, passphrase, user_id, space_key, save_path).await
}

/// In-memory decrypt: fetch → verify → decrypt → decompress → assemble into a
/// single buffer and return it (no disk write). The byte-returning sibling of
/// [`download`], for thumbnails / preview / the in-app viewer on desktop. Capped
/// at 512 MiB so a large file can't OOM the app — callers fall back to a
/// streamed [`download`] above the cap.
///
/// `space_key`: see [`download`] — `None` for the passphrase path, `Some(key)`
/// where `key` is the file's already-resolved content key (NOT the space's raw
/// symmetric key — see the note on [`download`]).
pub async fn decrypt_to_memory(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    space_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, EngineError> {
    decrypt_to_memory::run(ctx, file_id, passphrase, user_id, space_key).await
}

/// Client-side delete — the byos-direct counterpart to upload/download. The
/// device holds the platform token, so it removes the ciphertext straight from
/// the user's OWN storage and the backend only drops the metadata row (no
/// server deletion-worker load). Chunks whose platform the device has no creds
/// for are left to the backend. Also clears the local ledger row.
pub async fn delete(ctx: &EngineContext, file_id: &str) -> Result<(), EngineError> {
    delete::run(ctx, file_id).await
}

/// Background sync loop: drains pending files every second until cancelled
/// (send `true` on the watch channel, or drop the sender).
pub async fn run_sync(ctx: EngineContext, mut cancel: tokio::sync::watch::Receiver<bool>) {
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = tick.tick() => {
                sync::sync_once(&ctx).await;
            }
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    return;
                }
            }
        }
    }
}

/// Current ledger counts for the tray/status UI.
pub fn sync_status(db: &LocalDb) -> Result<SyncStats, EngineError> {
    Ok(db.get_sync_stats()?)
}
