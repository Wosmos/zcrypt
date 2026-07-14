//! Pipeline engines — the client work: local-first upload, background sync,
//! network upload, streaming download. Ports of `sidecar/pipeline/*` with two
//! deliberate upgrades: the download STREAMS to disk through a bounded reorder
//! buffer (the Go engine buffered whole files — a mobile OOM), and `upload()`
//! is local-first (encrypt→ledger, then drive one sync pass) so the two upload
//! paths can never drift.

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

/// Everything an engine call needs. The Tauri shell constructs one per
/// operation; `progress` forwards to the webview as window events.
pub struct EngineContext {
    pub client: Arc<Client>,
    pub db: Arc<LocalDb>,
    pub profile: Profile,
    pub progress: ProgressFn,
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
