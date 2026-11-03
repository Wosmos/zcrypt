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

/// Progress sink: the shells (Tauri commands) pass a closure that forwards to
/// `window.emit`; tests collect into a Vec.
pub type ProgressFn = std::sync::Arc<dyn Fn(Progress) + Send + Sync>;

/// A storage platform id as it appears on the wire, in the local ledger and in
/// the desktop keychain (`platform.<id>.token`). The strings are frozen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Telegram,
    GitHub,
    GitLab,
    HuggingFace,
}

/// A string that names no known [`Platform`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unknown platform: {0}")]
pub struct UnknownPlatform(pub String);

impl Platform {
    /// Every platform in upload preference order: Telegram first (effectively
    /// unbounded), then the git hosts, HuggingFace last.
    pub const ALL: [Platform; 4] = [
        Platform::Telegram,
        Platform::GitHub,
        Platform::GitLab,
        Platform::HuggingFace,
    ];

    /// The wire id.
    pub const fn as_str(self) -> &'static str {
        match self {
            Platform::Telegram => "telegram",
            Platform::GitHub => "github",
            Platform::GitLab => "gitlab",
            Platform::HuggingFace => "huggingface",
        }
    }

    /// Parses a wire id, `None` for anything unrecognised.
    pub fn from_id(id: &str) -> Option<Platform> {
        Platform::ALL.into_iter().find(|p| p.as_str() == id)
    }
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Platform {
    type Err = UnknownPlatform;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Platform::from_id(s).ok_or_else(|| UnknownPlatform(s.to_string()))
    }
}

impl TryFrom<&str> for Platform {
    type Error = UnknownPlatform;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        s.parse()
    }
}

/// The upload data plane recorded on a session and in the local ledger.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UploadMode {
    /// The server pushes to its own managed storage.
    #[serde(rename = "relay")]
    Relay,
    /// This device pushes to the user's own storage with the user's own token.
    #[serde(rename = "byos-direct")]
    ByosDirect,
}

/// A string that names no known [`UploadMode`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unknown upload mode: {0}")]
pub struct UnknownUploadMode(pub String);

impl UploadMode {
    /// The stored and wire id.
    pub const fn as_str(self) -> &'static str {
        match self {
            UploadMode::Relay => "relay",
            UploadMode::ByosDirect => "byos-direct",
        }
    }

    /// The `mode` an upload-init request carries: empty for relay (the server
    /// then picks and manages the repo), `byos-direct` otherwise.
    pub const fn init_field(self) -> &'static str {
        match self {
            UploadMode::Relay => "",
            UploadMode::ByosDirect => "byos-direct",
        }
    }
}

impl std::fmt::Display for UploadMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for UploadMode {
    type Err = UnknownUploadMode;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "relay" => Ok(UploadMode::Relay),
            "byos-direct" => Ok(UploadMode::ByosDirect),
            other => Err(UnknownUploadMode(other.to_string())),
        }
    }
}

impl TryFrom<&str> for UploadMode {
    type Error = UnknownUploadMode;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        s.parse()
    }
}

/// Where a file or chunk row stands in the local sync ledger. The strings are
/// the values stored in the SQLite `sync_status` columns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SyncStatus {
    /// Chunks are still being encrypted and staged; invisible to the sync loop.
    Staging,
    Pending,
    InitDone,
    Uploading,
    Synced,
    Error,
    Failed,
}

/// A string that names no known [`SyncStatus`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unknown sync status: {0}")]
pub struct UnknownSyncStatus(pub String);

impl SyncStatus {
    /// The stored id.
    pub const fn as_str(self) -> &'static str {
        match self {
            SyncStatus::Staging => "staging",
            SyncStatus::Pending => "pending",
            SyncStatus::InitDone => "init_done",
            SyncStatus::Uploading => "uploading",
            SyncStatus::Synced => "synced",
            SyncStatus::Error => "error",
            SyncStatus::Failed => "failed",
        }
    }
}

impl std::fmt::Display for SyncStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for SyncStatus {
    type Err = UnknownSyncStatus;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "staging" => Ok(SyncStatus::Staging),
            "pending" => Ok(SyncStatus::Pending),
            "init_done" => Ok(SyncStatus::InitDone),
            "uploading" => Ok(SyncStatus::Uploading),
            "synced" => Ok(SyncStatus::Synced),
            "error" => Ok(SyncStatus::Error),
            "failed" => Ok(SyncStatus::Failed),
            other => Err(UnknownSyncStatus(other.to_string())),
        }
    }
}

impl TryFrom<&str> for SyncStatus {
    type Error = UnknownSyncStatus;

    fn try_from(s: &str) -> Result<Self, UnknownSyncStatus> {
        s.parse()
    }
}

/// Status of a completed local file row (the `status` column).
pub const FILE_STATUS_COMPLETE: &str = "complete";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_wire_values_are_frozen() {
        let ids: Vec<&str> = Platform::ALL.iter().map(|p| p.as_str()).collect();
        assert_eq!(ids, ["telegram", "github", "gitlab", "huggingface"]);
        for p in Platform::ALL {
            assert_eq!(p.as_str().parse::<Platform>().unwrap(), p);
            assert_eq!(Platform::try_from(p.as_str()).unwrap(), p);
            assert_eq!(p.to_string(), p.as_str());
            assert_eq!(
                serde_json::to_string(&p).unwrap(),
                format!("\"{}\"", p.as_str())
            );
            let back: Platform = serde_json::from_str(&format!("\"{}\"", p.as_str())).unwrap();
            assert_eq!(back, p);
        }
        assert!("mock".parse::<Platform>().is_err());
        assert!("".parse::<Platform>().is_err());
        assert_eq!(Platform::from_id("GitHub"), None);
    }

    #[test]
    fn upload_mode_wire_values_are_frozen() {
        assert_eq!(UploadMode::Relay.as_str(), "relay");
        assert_eq!(UploadMode::ByosDirect.as_str(), "byos-direct");
        assert_eq!(UploadMode::Relay.init_field(), "");
        assert_eq!(UploadMode::ByosDirect.init_field(), "byos-direct");
        for m in [UploadMode::Relay, UploadMode::ByosDirect] {
            assert_eq!(m.as_str().parse::<UploadMode>().unwrap(), m);
            assert_eq!(
                serde_json::to_string(&m).unwrap(),
                format!("\"{}\"", m.as_str())
            );
        }
        assert!("".parse::<UploadMode>().is_err());
    }

    #[test]
    fn sync_status_stored_values_are_frozen() {
        let all = [
            (SyncStatus::Staging, "staging"),
            (SyncStatus::Pending, "pending"),
            (SyncStatus::InitDone, "init_done"),
            (SyncStatus::Uploading, "uploading"),
            (SyncStatus::Synced, "synced"),
            (SyncStatus::Error, "error"),
            (SyncStatus::Failed, "failed"),
        ];
        for (s, text) in all {
            assert_eq!(s.as_str(), text);
            assert_eq!(text.parse::<SyncStatus>().unwrap(), s);
        }
        assert!("done".parse::<SyncStatus>().is_err());
        assert_eq!(FILE_STATUS_COMPLETE, "complete");
    }
}
