//! GitHub platform adapter — port of `app/backend/adapters/github.go`.
//!
//! The Go side goes through go-github; this port calls the same REST
//! endpoints directly: the Contents API (base64 content on PUT, current blob
//! SHA required on DELETE), raw.githubusercontent.com for downloads, and the
//! recursive Git Trees API for listing.

use std::time::Duration;

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;
use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use reqwest::Method;
use serde::Deserialize;

use crate::adapters::{AdapterError, PlatformAdapter};
use crate::disguise;
use crate::types::{Chunk, ChunkRef};

const API: &str = "https://api.github.com";
const RAW: &str = "https://raw.githubusercontent.com";
const PLATFORM: &str = "github";

pub struct GitHub {
    token: String,
    account: String,
    client: reqwest::Client,
}

impl GitHub {
    pub fn new(token: &str, account: &str) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            // GitHub rejects requests without a User-Agent (go-github set its own).
            .user_agent("zcrypt-core")
            .build()
            .expect("build reqwest client");
        Self {
            token: token.into(),
            account: account.into(),
            client,
        }
    }

    /// The repo owner this adapter acts as — mirrors Go's `GetUsername`.
    pub fn username(&self) -> &str {
        &self.account
    }

    fn req(&self, method: Method, url: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github+json")
    }

    /// Extracts owner and repo name from either:
    ///   - `owner/repo-name` (correct format)
    ///   - `github_owner_repo-name` (legacy pool ID format)
    fn parse_repo<'a>(&'a self, repo: &'a str) -> (&'a str, &'a str) {
        if let Some((owner, name)) = repo.split_once('/') {
            return (owner, name);
        }
        // Legacy format: strip "github_" prefix, split on first "_".
        let legacy = repo.strip_prefix("github_").unwrap_or(repo);
        if let Some((owner, name)) = legacy.split_once('_') {
            return (owner, name);
        }
        // Fallback
        (&self.account, repo)
    }
}

fn contents_url(owner: &str, name: &str, path: &str) -> String {
    format!("{API}/repos/{owner}/{name}/contents/{path}")
}

fn raw_url(owner: &str, name: &str, path: &str) -> String {
    format!("{RAW}/{owner}/{name}/main/{path}")
}

fn tree_url(owner: &str, name: &str) -> String {
    format!("{API}/repos/{owner}/{name}/git/trees/HEAD?recursive=1")
}

/// Seconds from a `Retry-After` header, when present and numeric.
fn retry_after_secs(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

/// Map a failed status to the right `AdapterError` (pure — unit-testable).
/// 429 and GitHub's secondary rate limit (403 with "rate limit" in the body)
/// become `RateLimited`; 404 becomes `NotFound`; the rest are `Api` errors.
fn classify(status: u16, body: String, retry_after: Option<u64>, context: &str) -> AdapterError {
    match status {
        429 => AdapterError::RateLimited {
            platform: PLATFORM,
            retry_after_secs: retry_after,
        },
        403 if body.to_ascii_lowercase().contains("rate limit") => AdapterError::RateLimited {
            platform: PLATFORM,
            retry_after_secs: retry_after,
        },
        404 => AdapterError::NotFound(format!("{PLATFORM}: {context}")),
        _ => AdapterError::Api {
            platform: PLATFORM,
            status,
            body,
        },
    }
}

/// Consume a failed response into an `AdapterError`.
async fn error_from(context: &str, resp: reqwest::Response) -> AdapterError {
    let status = resp.status().as_u16();
    let retry_after = retry_after_secs(resp.headers());
    let body = resp.text().await.unwrap_or_default();
    classify(status, body, retry_after, context)
}

/// Exponential backoff base capped at 8s: 1, 2, 4, 8, 8, ... for attempt 1, 2,
/// 3, 4, 5, ... (Go: `1 << min(attempt-1, 3)` seconds).
fn backoff_base_secs(attempt: u32) -> u64 {
    1u64 << (attempt - 1).min(3)
}

/// Random jitter up to 1s. Uses `OsRng` because the crate carries no `rand`
/// dependency (same approach as `disguise.rs`).
fn jitter_ms() -> u64 {
    let mut b = [0u8; 8];
    OsRng.fill_bytes(&mut b);
    u64::from_le_bytes(b) % 1000
}

#[derive(Deserialize)]
struct CreatedRepo {
    full_name: String,
}

#[derive(Deserialize)]
struct RepoMeta {
    /// GitHub reports repo size in KB.
    #[serde(default)]
    size: i64,
}

#[derive(Deserialize)]
struct TreeEntry {
    #[serde(default)]
    path: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    size: i64,
}

#[derive(Deserialize)]
struct TreeResponse {
    #[serde(default)]
    tree: Vec<TreeEntry>,
    #[serde(default)]
    truncated: bool,
}

#[async_trait]
impl PlatformAdapter for GitHub {
    fn platform_name(&self) -> &'static str {
        PLATFORM
    }

    async fn create_repo(&self, name: &str) -> Result<String, AdapterError> {
        let resp = self
            .req(Method::POST, &format!("{API}/user/repos"))
            .json(&serde_json::json!({
                "name": name,
                "private": true,
                "description": "Internal build artifacts and cache storage",
                "auto_init": true,
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("create repo", resp).await);
        }
        let created: CreatedRepo = resp.json().await?;
        Ok(created.full_name)
    }

    async fn upload(&self, repo: &str, chunk: Chunk) -> Result<ChunkRef, AdapterError> {
        let Chunk {
            r#ref: mut chunk_ref,
            data,
        } = chunk;
        let remote_path = if chunk_ref.remote_path.is_empty() {
            disguise::sharded_chunk_filename()
        } else {
            chunk_ref.remote_path.clone()
        };

        let (owner, repo_name) = self.parse_repo(repo);
        let url = contents_url(owner, repo_name, &remote_path);
        let content_b64 = BASE64.encode(&data);

        // Retry on 409 (SHA conflict from concurrent commits) with exponential
        // backoff + jitter. The Contents API creates one commit per PUT, so
        // concurrent uploads to the same repo race on HEAD SHA. The path is
        // held STABLE across retries: a 409 is a HEAD-SHA race, not a path
        // collision — rotating the path would strand a maybe-committed blob
        // where deletion could never find it (see the Go adapter's comment).
        let mut last_err: Option<AdapterError> = None;
        for attempt in 0..10u32 {
            if attempt > 0 {
                let delay = Duration::from_secs(backoff_base_secs(attempt))
                    + Duration::from_millis(jitter_ms());
                tokio::time::sleep(delay).await;
            }

            let resp = self
                .req(Method::PUT, &url)
                .json(&serde_json::json!({
                    "message": disguise::commit_message(),
                    "content": &content_b64,
                }))
                .send()
                .await?;

            if resp.status().is_success() {
                chunk_ref.platform = PLATFORM.to_string();
                chunk_ref.repo = repo.to_string();
                chunk_ref.remote_path = remote_path;
                return Ok(chunk_ref);
            }

            let status = resp.status().as_u16();
            let err = error_from("upload chunk", resp).await;
            // Retry on 409 Conflict (concurrent commit changed HEAD SHA).
            if status == 409 {
                last_err = Some(err);
                continue;
            }
            // Non-retryable error.
            return Err(err);
        }

        Err(last_err.unwrap_or_else(|| AdapterError::Other("upload chunk after retries".into())))
    }

    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        let (owner, repo_name) = self.parse_repo(&r#ref.repo);

        // raw.githubusercontent.com directly — single request, no size limit,
        // avoids the 2-request Contents API dance (same as the Go adapter).
        let url = raw_url(owner, repo_name, &r#ref.remote_path);
        let resp = self.req(Method::GET, &url).send().await?;
        if !resp.status().is_success() {
            return Err(error_from("download chunk", resp).await);
        }
        Ok(resp.bytes().await?.to_vec())
    }

    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError> {
        let (owner, repo_name) = self.parse_repo(&r#ref.repo);
        let url = contents_url(owner, repo_name, &r#ref.remote_path);

        // Get the file's current SHA first — the Contents API requires it.
        let resp = self.req(Method::GET, &url).send().await?;
        // Already gone (404) → the chunk is deleted as far as we care; report
        // success so it leaves the deletion queue instead of retrying forever.
        if resp.status().as_u16() == 404 {
            return Ok(());
        }
        if !resp.status().is_success() {
            return Err(error_from("get file for delete", resp).await);
        }

        // When the path isn't a single file (e.g. a directory listing comes
        // back as an array) there is no SHA to delete, so the chunk is
        // effectively gone. Guard this: the Go side once nil-panicked here and
        // crash-looped the whole deletion worker.
        let meta: serde_json::Value = resp.json().await?;
        let Some(sha) = meta.get("sha").and_then(|s| s.as_str()) else {
            return Ok(());
        };

        let resp = self
            .req(Method::DELETE, &url)
            .json(&serde_json::json!({
                "message": disguise::commit_message(),
                "sha": sha,
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("delete chunk", resp).await);
        }
        Ok(())
    }

    async fn get_repo_size(&self, repo: &str) -> Result<i64, AdapterError> {
        let (owner, repo_name) = self.parse_repo(repo);
        let resp = self
            .req(Method::GET, &format!("{API}/repos/{owner}/{repo_name}"))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("get repo", resp).await);
        }
        let meta: RepoMeta = resp.json().await?;
        // GitHub returns size in KB.
        Ok(meta.size * 1024)
    }

    async fn list_chunks(&self, repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        // Owner split mirrors the Go ListChunks (no legacy `github_` handling).
        let (owner, repo_name) = match repo.split_once('/') {
            Some((owner, name)) => (owner, name),
            None => (self.account.as_str(), repo),
        };

        // Recursive Git Trees API rather than a root contents listing: chunks
        // live under a 2-hex-char shard directory (e.g. "02/abc.bin"), so a
        // root-only listing would miss every blob. recursive=1 returns the
        // whole tree in one call and each entry's path is the full sharded
        // path — exactly what chunks.remote_path stores.
        let resp = self
            .req(Method::GET, &tree_url(owner, repo_name))
            .send()
            .await?;
        // An empty repo (no commits yet) has no tree → nothing stored, not an error.
        if resp.status().as_u16() == 404 {
            return Ok(Vec::new());
        }
        if !resp.status().is_success() {
            return Err(error_from("get tree", resp).await);
        }
        let tree: TreeResponse = resp.json().await?;

        // GitHub truncates the tree response above ~100k entries / 7MB. Our
        // repos cap far below that, but surface truncation rather than
        // silently under-reporting, which for a reconciliation sweep would
        // hide real orphans.
        if tree.truncated {
            return Err(AdapterError::Other(format!(
                "tree listing truncated for {repo}: results incomplete"
            )));
        }

        Ok(tree
            .tree
            .into_iter()
            .filter(|e| e.kind == "blob" && e.path.ends_with(".bin"))
            .map(|e| ChunkRef {
                platform: PLATFORM.to_string(),
                repo: repo.to_string(),
                remote_path: e.path,
                size: e.size,
                ..ChunkRef::default()
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gh() -> GitHub {
        GitHub::new("tok", "acct")
    }

    #[test]
    fn parse_repo_forms() {
        let g = gh();
        assert_eq!(g.parse_repo("owner/repo-name"), ("owner", "repo-name"));
        // Legacy pool ID format.
        assert_eq!(
            g.parse_repo("github_owner_repo-name"),
            ("owner", "repo-name")
        );
        // Underscore split applies even without the prefix (Go parity).
        assert_eq!(g.parse_repo("owner_repo"), ("owner", "repo"));
        // Fallback: the authenticated account owns the bare name.
        assert_eq!(g.parse_repo("bare-name"), ("acct", "bare-name"));
        // Only the first slash splits; the rest stays in the name.
        assert_eq!(g.parse_repo("o/a/b"), ("o", "a/b"));
    }

    #[test]
    fn urls() {
        assert_eq!(
            contents_url("o", "r", "ab/cd.bin"),
            "https://api.github.com/repos/o/r/contents/ab/cd.bin"
        );
        assert_eq!(
            raw_url("o", "r", "ab/cd.bin"),
            "https://raw.githubusercontent.com/o/r/main/ab/cd.bin"
        );
        assert_eq!(
            tree_url("o", "r"),
            "https://api.github.com/repos/o/r/git/trees/HEAD?recursive=1"
        );
    }

    #[test]
    fn classify_statuses() {
        assert!(matches!(
            classify(429, String::new(), Some(7), "x"),
            AdapterError::RateLimited {
                platform: "github",
                retry_after_secs: Some(7)
            }
        ));
        // Secondary rate limit: 403 with "rate limit" in the body.
        assert!(matches!(
            classify(
                403,
                "You have exceeded a secondary rate limit".into(),
                None,
                "x"
            ),
            AdapterError::RateLimited {
                platform: "github",
                retry_after_secs: None
            }
        ));
        // A plain 403 stays an API error.
        assert!(matches!(
            classify(403, "forbidden".into(), None, "x"),
            AdapterError::Api { status: 403, .. }
        ));
        assert!(matches!(
            classify(404, String::new(), None, "x"),
            AdapterError::NotFound(_)
        ));
        assert!(matches!(
            classify(500, "boom".into(), None, "x"),
            AdapterError::Api { status: 500, .. }
        ));
    }

    #[test]
    fn backoff_caps_at_8s() {
        let secs: Vec<u64> = (1..10).map(backoff_base_secs).collect();
        assert_eq!(secs, vec![1, 2, 4, 8, 8, 8, 8, 8, 8]);
    }

    #[test]
    fn jitter_stays_below_one_second() {
        for _ in 0..64 {
            assert!(jitter_ms() < 1000);
        }
    }
}
