//! Pipeline engines — the client work: local-first upload, background sync,
//! network upload, streaming download. Ports of `sidecar/pipeline/*` with two
//! deliberate upgrades: the download STREAMS to disk through a bounded reorder
//! buffer (the Go engine buffered whole files — a mobile OOM), and `upload()`
//! is local-first (encrypt→ledger, then drive one sync pass) so the two upload
//! paths can never drift.

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
pub async fn download(
    ctx: &EngineContext,
    file_id: &str,
    passphrase: &str,
    user_id: &str,
    save_path: &Path,
) -> Result<(), EngineError> {
    download::run(ctx, file_id, passphrase, user_id, save_path).await
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
