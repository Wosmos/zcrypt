//! Platform storage adapters — the client-side ports of
//! `app/backend/adapters/*`, used for byos-direct transfers with the USER'S OWN
//! token (never the managed pool token, which must stay server-side).

use async_trait::async_trait;

use crate::types::{Chunk, ChunkRef};

pub mod github;
pub mod gitlab;
pub mod huggingface;
pub mod telegram;

#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    /// Platform rate limit (HTTP 429 / secondary limits). Callers back off or
    /// re-route the file to another platform.
    #[error("rate limited by {platform}{retry_after}", retry_after = .retry_after_secs.map(|s| format!(" (retry after {s}s)")).unwrap_or_default())]
    RateLimited {
        platform: &'static str,
        retry_after_secs: Option<u64>,
    },
    #[error("{platform} API error {status}: {body}")]
    Api {
        platform: &'static str,
        status: u16,
        body: String,
    },
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Other(String),
}

/// The unified platform interface — mirrors the Go `adapters.PlatformAdapter`.
/// All byte payloads are ciphertext; adapters never see plaintext.
#[async_trait]
pub trait PlatformAdapter: Send + Sync {
    fn platform_name(&self) -> &'static str;

    /// Create a repository (or equivalent container); returns its full
    /// name/locator (e.g. `owner/repo`). Must also seed the disguise README
    /// where applicable, matching the Go adapters.
    async fn create_repo(&self, name: &str) -> Result<String, AdapterError>;

    /// Push a chunk (already at `chunk.ref.remote_path` naming) and return the
    /// completed ref (platform fills `remote_path` for message-based backends
    /// like Telegram where the locator is only known after upload).
    async fn upload(&self, repo: &str, chunk: Chunk) -> Result<ChunkRef, AdapterError>;

    /// Fetch a chunk's ciphertext.
    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError>;

    /// Remove a chunk.
    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError>;

    /// Total bytes used in a repo (best-effort; used for rotation).
    async fn get_repo_size(&self, repo: &str) -> Result<i64, AdapterError>;

    /// List chunk files in a repo (reconcile support; Telegram returns
    /// `NotFound` — a chat can't be enumerated via the Bot API).
    async fn list_chunks(&self, repo: &str) -> Result<Vec<ChunkRef>, AdapterError>;
}

/// Construct the adapter for a platform with the user's own token.
/// `account` is the platform username/owner (git platforms) or chat id (Telegram).
pub fn new_adapter(platform: &str, token: &str, account: &str) -> Option<Box<dyn PlatformAdapter>> {
    match platform {
        "github" => Some(Box::new(github::GitHub::new(token, account))),
        "gitlab" => Some(Box::new(gitlab::GitLab::new(token, account))),
        "huggingface" => Some(Box::new(huggingface::HuggingFace::new(token, account))),
        "telegram" => Some(Box::new(telegram::Telegram::new(token, account))),
        _ => None,
    }
}
