//! Shared core types, mirroring `app/backend/types` and `sidecar/pipeline/types.go`
//! so the wire JSON stays identical.

use serde::{Deserialize, Serialize};

/// A chunk's identity + location, as the backend records it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChunkRef {
    #[serde(default)]
    pub chunk_id: String,
    #[serde(default)]
    pub file_id: String,
    #[serde(default)]
    pub index: i32,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub account: String,
    #[serde(default)]
    pub repo: String,
    #[serde(default)]
    pub remote_path: String,
    #[serde(default)]
    pub compressed: bool,
}

/// A chunk with its (encrypted) bytes, handed to a platform adapter.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub r#ref: ChunkRef,
    pub data: Vec<u8>,
}

/// A repository in the pool.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RepoInfo {
    pub id: String,
    #[serde(default)]
    pub user_id: String,
    pub platform: String,
    #[serde(default)]
    pub account: String,
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub used_bytes: i64,
    #[serde(default)]
    pub max_bytes: i64,
    #[serde(default)]
    pub active: bool,
}

/// Upload/download progress event emitted to the shell (Tauri window event).
/// Field names match the sidecar's JSON so the existing frontend types
/// (`lib/tauri.ts` SidecarProgress) keep working.
#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub file_id: String,
    pub file_name: String,
    pub stage: Stage,
    pub chunks_done: u32,
    pub chunks_total: u32,
    pub bytes_done: i64,
    pub bytes_total: i64,
    pub speed: f64,
}

/// Pipeline stages (superset of upload + download, same strings as the sidecar).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Hashing,
    DerivingKey,
    Processing,
    Encrypting,
    Uploading,
    Finalizing,
    FetchingMeta,
    Downloading,
    Verifying,
    Saving,
    Done,
}

/// Progress sink — the shells (Tauri commands) pass a closure that forwards to
/// `window.emit`; tests collect into a Vec.
pub type ProgressFn = std::sync::Arc<dyn Fn(Progress) + Send + Sync>;
