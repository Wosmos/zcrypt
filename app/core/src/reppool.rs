//! Client-side repo pool — port of `app/backend/reppool/manager.go`, operating
//! with the user's OWN platform token. Repos the client creates are registered
//! with the backend control plane (`POST /api/repos/register`) so the server's
//! index, quota cross-checks, and reconcile keep working.

use crate::adapters::{AdapterError, PlatformAdapter};
use crate::disguise;
use crate::types::RepoInfo;

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;
use async_trait::async_trait;

/// Where the pool's repo records live. Implemented by the control-plane API
/// (list/register/usage) — kept as a trait so engine tests can use an
/// in-memory store.
#[async_trait]
pub trait RepoStore: Send + Sync {
    /// Repos for (platform, account), newest state first is not required.
    async fn list_repos(&self, platform: &str, account: &str) -> Result<Vec<RepoInfo>, String>;
    /// Register a client-created repo with the control plane.
    async fn register_repo(&self, repo: &RepoInfo) -> Result<(), String>;
    /// Bump usage after an upload (client-reported; server cross-checks).
    async fn update_usage(&self, repo_id: &str, additional_bytes: i64) -> Result<(), String>;
    /// Deactivate a full repo.
    async fn deactivate_repo(&self, repo_id: &str) -> Result<(), String>;
}

#[derive(Debug, thiserror::Error)]
pub enum PoolError {
    #[error("adapter: {0}")]
    Adapter(#[from] AdapterError),
    #[error("store: {0}")]
    Store(String),
}

pub struct Pool<'a> {
    pub adapter: &'a dyn PlatformAdapter,
    pub store: &'a dyn RepoStore,
    pub account: String,
    /// Rotation threshold in bytes (platform-specific, mirrors the backend's
    /// per-platform defaults).
    pub threshold: i64,
}

impl<'a> Pool<'a> {
    /// Active repo with room, or rotate + create. Mirrors `GetOrCreateRepo`.
    pub async fn get_or_create_repo(&self) -> Result<RepoInfo, PoolError> {
        let repos = self
            .store
            .list_repos(self.adapter.platform_name(), &self.account)
            .await
            .map_err(PoolError::Store)?;

        if let Some(active) = repos.iter().find(|r| r.active) {
            if active.used_bytes < self.threshold {
                return Ok(active.clone());
            }
            self.store
                .deactivate_repo(&active.id)
                .await
                .map_err(PoolError::Store)?;
        }

        self.create_new_repo(repos.len() + 1).await
    }

    async fn create_new_repo(&self, index: usize) -> Result<RepoInfo, PoolError> {
        let name = disguise::repo_name(index);
        let full_name = self.adapter.create_repo(&name).await?;

        let repo = RepoInfo {
            id: new_repo_id(self.adapter.platform_name(), &self.account, &name),
            user_id: String::new(),
            platform: self.adapter.platform_name().to_string(),
            account: self.account.clone(),
            name,
            url: full_name,
            used_bytes: 0,
            max_bytes: self.threshold,
            active: true,
        };
        self.store
            .register_repo(&repo)
            .await
            .map_err(PoolError::Store)?;
        Ok(repo)
    }
}

/// Globally-unique repo id: readable prefix + random suffix — same scheme as
/// the backend's `newRepoID` (random disguise names may repeat; the PK must not).
pub fn new_repo_id(platform: &str, account: &str, name: &str) -> String {
    let mut b = [0u8; 6];
    OsRng.fill_bytes(&mut b);
    format!("{platform}_{account}_{name}_{}", hex::encode(b))
}

/// Per-platform rotation thresholds — mirrors `cmd/server.go:313`.
pub fn default_threshold(platform: &str) -> i64 {
    const MB: i64 = 1024 * 1024;
    const GB: i64 = 1024 * MB;
    match platform {
        "github" => 850 * MB,
        "gitlab" => 9 * GB,
        "huggingface" => 90 * GB,
        _ => 50 * GB, // telegram
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_ids_unique_for_identical_inputs() {
        let a = new_repo_id("github", "acct", "swift-otter-v1");
        let b = new_repo_id("github", "acct", "swift-otter-v1");
        assert_ne!(a, b);
        assert!(a.starts_with("github_acct_swift-otter-v1_"));
    }
}
