//! GitLab platform adapter, port of `app/backend/adapters/gitlab.go`.
//!
//! Repository Files API with percent-encoded project paths (`owner%2Fname`,
//! matching Go's `url.PathEscape`), base64 content, and offset-paginated
//! recursive tree listing.

use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use bytes::Bytes;
use reqwest::Method;
use serde::Deserialize;

use crate::adapters::{validate_locator, AdapterError, PlatformAdapter};
use crate::disguise;
use crate::transport::{
    backoff, download_client, honor_retry_after, upload_client, Idle, CONNECT_TIMEOUT, IDLE_TIMEOUT,
};
use crate::types::{Chunk, ChunkRef, Platform};

const API: &str = "https://gitlab.com/api/v4";
const PLATFORM: &str = Platform::GitLab.as_str();
const TREE_PER_PAGE: usize = 100;

pub struct GitLab {
    token: String,
    account: String,
    client: reqwest::Client,
    dl: reqwest::Client,
    up: reqwest::Client,
    idle: Duration,
    api: String,
}

impl GitLab {
    pub fn new(token: &str, account: &str) -> Self {
        Self::with_api(token, account, API, IDLE_TIMEOUT)
    }

    pub(crate) fn with_api(token: &str, account: &str, api: &str, idle: Duration) -> Self {
        let build = |b: reqwest::ClientBuilder| b.build().expect("build reqwest client");
        Self {
            token: token.into(),
            account: account.into(),
            client: build(reqwest::Client::builder().connect_timeout(CONNECT_TIMEOUT)),
            dl: build(download_client(idle)),
            up: build(upload_client()),
            idle,
            api: api.into(),
        }
    }

    /// The authenticated GitLab username, mirrors Go's `GetUsername`.
    pub fn username(&self) -> &str {
        &self.account
    }

    fn req(&self, method: Method, url: &str) -> reqwest::RequestBuilder {
        self.req_on(&self.client, method, url)
            .timeout(super::REQUEST_TIMEOUT)
    }

    fn req_on(
        &self,
        client: &reqwest::Client,
        method: Method,
        url: &str,
    ) -> reqwest::RequestBuilder {
        client
            .request(method, url)
            .header("PRIVATE-TOKEN", self.token.as_str())
    }

    async fn existing_size(&self, repo: &str, path: &str) -> Option<u64> {
        let url = format!("{}?ref=main", file_url(&self.api, repo, path));
        let resp = self.req(Method::GET, &url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<serde_json::Value>()
            .await
            .ok()?
            .get("size")?
            .as_u64()
    }

    fn check(&self, repo: &str, remote_path: &str) -> Result<(), AdapterError> {
        let (owner, name) = repo.split_once('/').unwrap_or((repo, ""));
        validate_locator(&self.account, owner, name, remote_path)
    }
}

fn file_url(api: &str, repo: &str, path: &str) -> String {
    format!(
        "{api}/projects/{}/repository/files/{}",
        urlencoding::encode(repo),
        urlencoding::encode(path)
    )
}

fn raw_file_url(api: &str, repo: &str, path: &str) -> String {
    format!("{}/raw?ref=main", file_url(api, repo, path))
}

fn project_url(api: &str, repo: &str) -> String {
    format!(
        "{api}/projects/{}?statistics=true",
        urlencoding::encode(repo)
    )
}

fn tree_url(api: &str, repo: &str, page: usize) -> String {
    format!(
        "{api}/projects/{}/repository/tree?ref=main&recursive=true&per_page={TREE_PER_PAGE}&page={page}",
        urlencoding::encode(repo)
    )
}

/// Map a failed status to the right `AdapterError` (pure, unit-testable).
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
    let retry_after = crate::transport::retry_after_secs(resp.headers());
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
            .req(Method::POST, &format!("{}/projects", self.api))
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

        self.check(repo, &remote_path)?;
        let url = file_url(&self.api, repo, &remote_path);
        let payload = Bytes::from(
            serde_json::to_vec(&serde_json::json!({
                "branch": "main",
                "content": BASE64.encode(&data),
                "commit_message": disguise::commit_message(),
                "encoding": "base64",
            }))
            .map_err(|e| AdapterError::Other(format!("encode upload: {e}")))?,
        );

        // Retry transient failures (network, stall, 429, 5xx). The path is held
        // stable, so a retry after a lost response meets "file already exists";
        // that counts as success when the stored size matches.
        let mut last_err: Option<AdapterError> = None;
        for attempt in 0..5u32 {
            if attempt > 0 {
                let retry_after = last_err.as_ref().and_then(AdapterError::retry_after_secs);
                tokio::time::sleep(honor_retry_after(
                    backoff(attempt - 1, 1_000, 8_000),
                    retry_after,
                ))
                .await;
            }
            let idle = Idle::new(self.idle);
            let sent = idle
                .guard(async {
                    let resp = self
                        .req_on(&self.up, Method::POST, &url)
                        .header("Content-Type", "application/json")
                        .header("Content-Length", payload.len())
                        .body(idle.body(payload.clone()))
                        .send()
                        .await?;
                    if !resp.status().is_success() {
                        return Err(error_from("upload chunk", resp).await);
                    }
                    // Decode-validate the response like the Go adapter (it
                    // parses `file_path` from the body and then ignores it).
                    let _: serde_json::Value = resp.json().await?;
                    Ok(())
                })
                .await;
            let err = match sent {
                Ok(()) => break,
                Err(e) => e,
            };
            if matches!(&err, AdapterError::Api { status: 400, body, .. } if body.contains("already exists"))
                && self.existing_size(repo, &remote_path).await == Some(data.len() as u64)
            {
                break;
            }
            if !err.is_transient() || attempt + 1 == 5 {
                return Err(err);
            }
            last_err = Some(err);
        }

        chunk_ref.platform = PLATFORM.to_string();
        chunk_ref.repo = repo.to_string();
        chunk_ref.remote_path = remote_path;
        Ok(chunk_ref)
    }

    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        self.check(&r#ref.repo, &r#ref.remote_path)?;
        let url = raw_file_url(&self.api, &r#ref.repo, &r#ref.remote_path);
        let resp = self.req_on(&self.dl, Method::GET, &url).send().await?;
        if !resp.status().is_success() {
            return Err(error_from("download chunk", resp).await);
        }
        Ok(resp.bytes().await?.to_vec())
    }

    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError> {
        self.check(&r#ref.repo, &r#ref.remote_path)?;
        let resp = self
            .req(
                Method::DELETE,
                &file_url(&self.api, &r#ref.repo, &r#ref.remote_path),
            )
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
        let resp = self
            .req(Method::GET, &project_url(&self.api, repo))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("get project", resp).await);
        }
        let meta: ProjectMeta = resp.json().await?;
        Ok(meta.statistics.repository_size)
    }

    async fn list_chunks(&self, repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        // recursive=true walks the shard subdirectories (chunks live under a
        // 2-hex prefix like "02/abc.bin"), and each entry's `path` is the full
        // sharded path that chunks.remote_path stores, so a reconciliation
        // diff lines up. Page through with offset pagination until a short
        // page signals the end; a non-recursive or single-page listing would
        // silently under-report and hide real orphans.
        let mut refs = Vec::new();
        for page in 1usize.. {
            let resp = self
                .req(Method::GET, &tree_url(&self.api, repo, page))
                .send()
                .await?;
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
            file_url(API, "owner/repo", "ab/cd.bin"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/ab%2Fcd.bin"
        );
        assert_eq!(
            raw_file_url(API, "owner/repo", "ab/cd.bin"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/ab%2Fcd.bin/raw?ref=main"
        );
        assert_eq!(
            project_url(API, "owner/repo"),
            "https://gitlab.com/api/v4/projects/owner%2Frepo?statistics=true"
        );
        assert_eq!(
            tree_url(API, "owner/repo", 2),
            "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/tree?ref=main&recursive=true&per_page=100&page=2"
        );
    }

    #[test]
    fn classify_statuses() {
        assert!(matches!(
            classify(429, String::new(), Some(30), "x"),
            AdapterError::RateLimited {
                platform: PLATFORM,
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

#[cfg(test)]
mod transfer_tests {
    use super::*;
    use crate::testutil::{serve, Reply};
    use std::sync::atomic::Ordering;

    fn chunk(len: usize) -> Chunk {
        Chunk {
            r#ref: ChunkRef {
                remote_path: "ab/cdef0123.bin".into(),
                ..ChunkRef::default()
            },
            data: Bytes::from(vec![4u8; len]),
        }
    }

    #[tokio::test]
    async fn a_retry_that_finds_its_own_file_already_stored_succeeds() {
        let (base, _) = serve(|_, req| {
            if req.method == "POST" {
                Reply::status(400, r#"{"message":"A file with this name already exists"}"#)
            } else {
                Reply::status(200, r#"{"size":2048}"#)
            }
        })
        .await;
        let gl = GitLab::with_api("tok", "acct", &base, Duration::from_secs(5));
        assert!(gl.upload("acct/repo", chunk(2048)).await.is_ok());
    }

    #[tokio::test]
    async fn a_503_is_retried_and_a_403_is_not() {
        let (base, hits) = serve(|_, _| Reply::status(403, "no")).await;
        let gl = GitLab::with_api("tok", "acct", &base, Duration::from_secs(5));
        assert!(gl.upload("acct/repo", chunk(512)).await.is_err());
        assert_eq!(hits.load(Ordering::SeqCst), 1);

        let (base, hits) = serve(|n, _| {
            if n == 0 {
                Reply::with_header(429, "retry-after", "1", "slow")
            } else {
                Reply::status(201, "{}")
            }
        })
        .await;
        let gl = GitLab::with_api("tok", "acct", &base, Duration::from_secs(5));
        gl.upload("acct/repo", chunk(512)).await.unwrap();
        assert_eq!(hits.load(Ordering::SeqCst), 2);
    }
}
