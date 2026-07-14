//! GitLab platform adapter — port of `app/backend/adapters/gitlab.go`.
//!
//! Repository Files API with percent-encoded project paths (`owner%2Fname`,
//! matching Go's `url.PathEscape`), base64 content, and offset-paginated
//! recursive tree listing.

use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use reqwest::Method;
use serde::Deserialize;

use crate::adapters::{AdapterError, PlatformAdapter};
use crate::disguise;
use crate::types::{Chunk, ChunkRef};

const API: &str = "https://gitlab.com/api/v4";
const PLATFORM: &str = "gitlab";
const TREE_PER_PAGE: usize = 100;

pub struct GitLab {
    token: String,
    account: String,
    client: reqwest::Client,
}

impl GitLab {
    pub fn new(token: &str, account: &str) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("build reqwest client");
        Self {
            token: token.into(),
            account: account.into(),
            client,
        }
    }

    /// The authenticated GitLab username — mirrors Go's `GetUsername`.
    pub fn username(&self) -> &str {
        &self.account
    }

    fn req(&self, method: Method, url: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, url)
            .header("PRIVATE-TOKEN", self.token.as_str())
    }
}

fn file_url(repo: &str, path: &str) -> String {
    format!(
        "{API}/projects/{}/repository/files/{}",
        urlencoding::encode(repo),
        urlencoding::encode(path)
    )
}

fn raw_file_url(repo: &str, path: &str) -> String {
    format!("{}/raw?ref=main", file_url(repo, path))
}

fn project_url(repo: &str) -> String {
    format!(
        "{API}/projects/{}?statistics=true",
        urlencoding::encode(repo)
    )
}

fn tree_url(repo: &str, page: usize) -> String {
    format!(
        "{API}/projects/{}/repository/tree?ref=main&recursive=true&per_page={TREE_PER_PAGE}&page={page}",
        urlencoding::encode(repo)
    )
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
/// 429 becomes `RateLimited`; 404 becomes `NotFound`; the rest are `Api`
/// errors (GitLab has no body-sniffed secondary rate limit like GitHub's).
fn classify(status: u16, body: String, retry_after: Option<u64>, context: &str) -> AdapterError {
    match status {
        429 => AdapterError::RateLimited {
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

#[derive(Deserialize)]
struct CreatedProject {
    path_with_namespace: String,
}

#[derive(Deserialize)]
struct ProjectMeta {
    #[serde(default)]
    statistics: ProjectStats,
}

#[derive(Deserialize, Default)]
struct ProjectStats {
    #[serde(default)]
    repository_size: i64,
}

#[derive(Deserialize)]
struct TreeItem {
    #[serde(default)]
    path: String,
    #[serde(rename = "type", default)]
    kind: String,
}

#[async_trait]
impl PlatformAdapter for GitLab {
    fn platform_name(&self) -> &'static str {
        PLATFORM
    }

    async fn create_repo(&self, name: &str) -> Result<String, AdapterError> {
        let resp = self
            .req(Method::POST, &format!("{API}/projects"))
            .json(&serde_json::json!({
                "name": name,
                "visibility": "private",
                "description": "Internal build artifacts and cache storage",
                "initialize_with_readme": true,
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("create project", resp).await);
        }
        let created: CreatedProject = resp.json().await?;
        Ok(created.path_with_namespace)
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

        let resp = self
            .req(Method::POST, &file_url(repo, &remote_path))
            .json(&serde_json::json!({
                "branch": "main",
                "content": BASE64.encode(&data),
                "commit_message": disguise::commit_message(),
                "encoding": "base64",
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("upload chunk", resp).await);
        }
        // Decode-validate the response like the Go adapter (it parses
        // `file_path` from the body and then ignores it).
        let _: serde_json::Value = resp.json().await?;

        chunk_ref.platform = PLATFORM.to_string();
        chunk_ref.repo = repo.to_string();
        chunk_ref.remote_path = remote_path;
        Ok(chunk_ref)
    }

    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        let url = raw_file_url(&r#ref.repo, &r#ref.remote_path);
        let resp = self.req(Method::GET, &url).send().await?;
        if !resp.status().is_success() {
            return Err(error_from("download chunk", resp).await);
        }
        Ok(resp.bytes().await?.to_vec())
    }

    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError> {
        let resp = self
            .req(Method::DELETE, &file_url(&r#ref.repo, &r#ref.remote_path))
            .json(&serde_json::json!({
                "branch": "main",
                "commit_message": disguise::commit_message(),
            }))
            .send()
            .await?;

        let status = resp.status().as_u16();
        // 404 → the file is already gone (e.g. a planned-but-never-uploaded
        // chunk, or a retry after a prior delete succeeded). Report success so
        // it leaves the deletion queue instead of retrying forever.
        if status == 404 {
            return Ok(());
        }
        if status != 204 && status != 200 {
            return Err(error_from("delete chunk", resp).await);
        }
        Ok(())
    }

    async fn get_repo_size(&self, repo: &str) -> Result<i64, AdapterError> {
        let resp = self.req(Method::GET, &project_url(repo)).send().await?;
        if !resp.status().is_success() {
            return Err(error_from("get project", resp).await);
        }
        let meta: ProjectMeta = resp.json().await?;
        Ok(meta.statistics.repository_size)
    }

    async fn list_chunks(&self, repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        // recursive=true walks the shard subdirectories (chunks live under a
        // 2-hex prefix like "02/abc.bin"), and each entry's `path` is the full
        // sharded path that chunks.remote_path stores — so a reconciliation
        // diff lines up. Page through with offset pagination until a short
        // page signals the end; a non-recursive or single-page listing would
        // silently under-report and hide real orphans.
        let mut refs = Vec::new();
        for page in 1usize.. {
            let resp = self.req(Method::GET, &tree_url(repo, page)).send().await?;
            if !resp.status().is_success() {
                return Err(error_from(&format!("list tree page {page}"), resp).await);
            }
            let items: Vec<TreeItem> = resp.json().await?;
            let page_len = items.len();

            for item in items {
                if item.kind == "blob" && item.path.ends_with(".bin") {
                    refs.push(ChunkRef {
                        platform: PLATFORM.to_string(),
                        repo: repo.to_string(),
                        remote_path: item.path,
                        ..ChunkRef::default()
                    });
                }
            }

            // A short (or empty) page is the last one.
            if page_len < TREE_PER_PAGE {
                break;
            }
        }

        Ok(refs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_percent_encode_project_and_path() {
        // '/' must become %2F in both the project locator and the file path,
        // matching Go's url.PathEscape.
        assert_eq!(
            file_url("owner/repo", "ab/cd.bin"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/ab%2Fcd.bin"
        );
        assert_eq!(
            raw_file_url("owner/repo", "ab/cd.bin"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/ab%2Fcd.bin/raw?ref=main"
        );
        assert_eq!(
            project_url("owner/repo"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo?statistics=true"
        );
        assert_eq!(
            tree_url("owner/repo", 2),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/tree?ref=main&recursive=true&per_page=100&page=2"
        );
    }

    #[test]
    fn classify_statuses() {
        assert!(matches!(
            classify(429, String::new(), Some(30), "x"),
            AdapterError::RateLimited {
                platform: "gitlab",
                retry_after_secs: Some(30)
            }
        ));
        assert!(matches!(
            classify(404, String::new(), None, "x"),
            AdapterError::NotFound(_)
        ));
        // No secondary-rate-limit body sniffing on GitLab: a 403 mentioning
        // "rate limit" stays an API error.
        assert!(matches!(
            classify(403, "rate limit".into(), None, "x"),
            AdapterError::Api { status: 403, .. }
        ));
        assert!(matches!(
            classify(500, "boom".into(), None, "x"),
            AdapterError::Api { status: 500, .. }
        ));
    }

    #[test]
    fn username_returns_account() {
        assert_eq!(GitLab::new("tok", "acct").username(), "acct");
    }
}
