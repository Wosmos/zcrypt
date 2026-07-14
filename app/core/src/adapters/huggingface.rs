//! HuggingFace Hub platform adapter — port of `app/backend/adapters/huggingface.go`.
//!
//! HuggingFace stores large binaries via Git LFS, so a chunk upload is a
//! three-step dance: (1) the LFS *batch* API hands back a presigned PUT URL (or
//! signals the object already exists — content-addressed dedup); (2) PUT the
//! ciphertext to that URL; (3) an NDJSON *commit* makes the blob appear in the
//! repo tree at our disguised path.
//!
//! The Go adapter buffers commits and flushes them in one batch (its
//! `BatchCommitter` interface). The client-side `PlatformAdapter` trait has no
//! flush hook, so this port commits per upload. That is deliberate for
//! byos-direct v1 — HuggingFace is a *capacity* backend, not the primary
//! (placement is Telegram-weighted), so it sees few chunks per file and the
//! ~128-commits/hour/repo limit is not a concern in practice. A 429 surfaces as
//! `RateLimited` so placement can back off / re-route.

use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;
use serde::Deserialize;

use crate::adapters::{AdapterError, PlatformAdapter};
use crate::crypto;
use crate::disguise;
use crate::types::{Chunk, ChunkRef};

const ENDPOINT: &str = "https://huggingface.co";
const PLATFORM: &str = "huggingface";
const MAX_RETRIES: u32 = 3;

pub struct HuggingFace {
    token: String,
    account: String,
    client: reqwest::Client,
}

impl HuggingFace {
    pub fn new(token: &str, account: &str) -> Self {
        let client = reqwest::Client::builder()
            // No overall timeout — LFS PUTs can be large; rely on connect/read
            // timeouts at the transport layer instead (matches Go's Timeout: 0).
            .connect_timeout(Duration::from_secs(30))
            .user_agent("zcrypt-core")
            .build()
            .expect("build reqwest client");
        Self {
            token: token.into(),
            account: account.into(),
            client,
        }
    }

    /// The authenticated username — mirrors Go's `GetUsername`. Supplied at
    /// construction (from the caller's stored account) rather than via a
    /// `whoami` round-trip, matching the other Rust adapters.
    pub fn username(&self) -> &str {
        &self.account
    }

    /// Repos may be stored as the bare name (legacy) or full `owner/name`.
    /// Every HF API path needs `owner/name`, so prepend the account when the
    /// slash is missing (a full name is returned unchanged).
    fn full_repo(&self, repo: &str) -> String {
        if repo.contains('/') {
            repo.to_string()
        } else {
            format!("{}/{}", self.account, repo)
        }
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.header("Authorization", format!("Bearer {}", self.token))
    }

    /// LFS batch: obtain a presigned upload URL for `oid`/`size`. Returns
    /// `None` when the object already exists on the platform (dedup — no PUT
    /// needed). Retries transient 5xx with backoff.
    async fn lfs_upload_info(
        &self,
        repo: &str,
        oid: &str,
        size: i64,
    ) -> Result<Option<(String, HashMap<String, String>)>, AdapterError> {
        let url = format!("{ENDPOINT}/{repo}.git/info/lfs/objects/batch");
        let body = serde_json::json!({
            "operation": "upload",
            "transfers": ["basic"],
            "objects": [{ "oid": oid, "size": size }],
        });

        let mut last: Option<AdapterError> = None;
        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(backoff(attempt)).await;
            }
            let resp = self
                .auth(self.client.post(&url))
                .header("Content-Type", "application/vnd.git-lfs+json")
                .header("Accept", "application/vnd.git-lfs+json")
                .json(&body)
                .send()
                .await?;
            let status = resp.status().as_u16();
            if status >= 500 {
                last = Some(error_from("lfs batch", resp).await);
                continue;
            }
            if !resp.status().is_success() {
                return Err(error_from("lfs batch", resp).await);
            }
            let batch: LfsBatchResponse = resp.json().await?;
            let obj = batch
                .objects
                .into_iter()
                .next()
                .ok_or_else(|| AdapterError::Other("lfs batch returned no objects".into()))?;
            let href = obj.actions.upload.href;
            if href.is_empty() {
                return Ok(None); // already exists (dedup)
            }
            return Ok(Some((href, obj.actions.upload.header)));
        }
        Err(last.unwrap_or_else(|| AdapterError::Other("lfs batch after retries".into())))
    }

    /// PUT ciphertext to a presigned LFS URL. Retries transient 5xx.
    async fn lfs_put(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        data: Vec<u8>,
    ) -> Result<(), AdapterError> {
        let mut last: Option<AdapterError> = None;
        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(backoff(attempt)).await;
            }
            let mut rb = self
                .client
                .put(url)
                .header("Content-Type", "application/octet-stream");
            for (k, v) in headers {
                rb = rb.header(k, v);
            }
            let resp = rb.body(data.clone()).send().await?;
            let status = resp.status().as_u16();
            if status >= 500 {
                last = Some(error_from("lfs put", resp).await);
                continue;
            }
            if !resp.status().is_success() {
                return Err(error_from("lfs put", resp).await);
            }
            return Ok(());
        }
        Err(last.unwrap_or_else(|| AdapterError::Other("lfs put after retries".into())))
    }

    /// POST an NDJSON commit referencing an already-uploaded LFS object so it
    /// appears in the repo tree. Retries transient 5xx; a 429 surfaces as
    /// `RateLimited` (HF caps ~128 commits/hour/repo).
    async fn commit_lfs(
        &self,
        repo: &str,
        path: &str,
        oid: &str,
        size: i64,
    ) -> Result<(), AdapterError> {
        let ndjson = build_ndjson(&[
            serde_json::json!({
                "key": "header",
                "value": { "summary": disguise::commit_message() },
            }),
            serde_json::json!({
                "key": "lfsFile",
                "value": { "path": path, "algo": "sha256", "oid": oid, "size": size },
            }),
        ]);
        self.post_commit(repo, ndjson, "lfs commit").await
    }

    /// Shared NDJSON-commit POST with 5xx retry / 429→RateLimited handling.
    async fn post_commit(
        &self,
        repo: &str,
        ndjson: Vec<u8>,
        context: &str,
    ) -> Result<(), AdapterError> {
        let url = format!("{ENDPOINT}/api/models/{repo}/commit/main");
        let mut last: Option<AdapterError> = None;
        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(backoff(attempt)).await;
            }
            let resp = self
                .auth(self.client.post(&url))
                .header("Content-Type", "application/x-ndjson")
                .body(ndjson.clone())
                .send()
                .await?;
            if resp.status().is_success() {
                return Ok(());
            }
            let status = resp.status().as_u16();
            // Already gone (delete of an absent path) → caller treats as success.
            if status == 404 {
                return Err(AdapterError::NotFound(format!("{PLATFORM}: {context}")));
            }
            let err = error_from(context, resp).await;
            // 429 → surface immediately so placement can back off / re-route.
            if matches!(err, AdapterError::RateLimited { .. }) {
                return Err(err);
            }
            if status >= 500 {
                last = Some(err);
                continue;
            }
            return Err(err);
        }
        Err(last.unwrap_or_else(|| AdapterError::Other(format!("{context} after retries"))))
    }
}

#[async_trait]
impl PlatformAdapter for HuggingFace {
    fn platform_name(&self) -> &'static str {
        PLATFORM
    }

    async fn create_repo(&self, name: &str) -> Result<String, AdapterError> {
        let resp = self
            .auth(self.client.post(format!("{ENDPOINT}/api/repos/create")))
            .json(&serde_json::json!({
                "type": "model",
                "name": name,
                "private": true,
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("create repo", resp).await);
        }
        // The response carries a URL, but the canonical locator is owner/name.
        Ok(format!("{}/{}", self.account, name))
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
        let repo = self.full_repo(repo);

        // LFS is content-addressed by the SHA-256 of the (ciphertext) bytes.
        let oid = crypto::sha256_hex(&data);
        let size = data.len() as i64;

        // batch → (PUT unless dedup) → commit.
        if let Some((url, headers)) = self.lfs_upload_info(&repo, &oid, size).await? {
            self.lfs_put(&url, &headers, data).await?;
        }
        self.commit_lfs(&repo, &remote_path, &oid, size).await?;

        chunk_ref.platform = PLATFORM.to_string();
        chunk_ref.repo = repo;
        chunk_ref.remote_path = remote_path;
        Ok(chunk_ref)
    }

    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        let repo = self.full_repo(&r#ref.repo);
        let url = format!("{ENDPOINT}/{repo}/resolve/main/{}", r#ref.remote_path);
        let resp = self.auth(self.client.get(&url)).send().await?;
        if !resp.status().is_success() {
            return Err(error_from("download chunk", resp).await);
        }
        Ok(resp.bytes().await?.to_vec())
    }

    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError> {
        let repo = self.full_repo(&r#ref.repo);
        let ndjson = build_ndjson(&[
            serde_json::json!({
                "key": "header",
                "value": { "summary": disguise::commit_message() },
            }),
            serde_json::json!({
                "key": "deletedFile",
                "value": { "path": r#ref.remote_path },
            }),
        ]);
        // A 404 means the file (or repo) is already gone — a planned-but-never
        // -uploaded chunk, or a retry after a prior delete. Report success so it
        // leaves the deletion queue instead of retrying to a dead letter forever.
        match self.post_commit(&repo, ndjson, "delete commit").await {
            Ok(()) => Ok(()),
            Err(AdapterError::NotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }

    async fn get_repo_size(&self, repo: &str) -> Result<i64, AdapterError> {
        let repo = self.full_repo(repo);
        let resp = self
            .auth(self.client.get(format!("{ENDPOINT}/api/models/{repo}")))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(error_from("get repo info", resp).await);
        }
        let info: RepoInfo = resp.json().await?;
        Ok(info.siblings.iter().map(|s| s.size).sum())
    }

    async fn list_chunks(&self, repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        let repo = self.full_repo(repo);
        // recursive=true walks the 2-hex shard subdirectories; limit=1000 is the
        // API max and the Link header carries a rel="next" cursor when a repo has
        // more, which we follow so nothing is silently under-reported.
        let mut next = Some(format!(
            "{ENDPOINT}/api/models/{repo}/tree/main?recursive=true&limit=1000"
        ));
        let mut refs = Vec::new();
        while let Some(url) = next {
            let resp = self.auth(self.client.get(&url)).send().await?;
            if !resp.status().is_success() {
                return Err(error_from("list tree", resp).await);
            }
            next = parse_next_link(
                resp.headers()
                    .get(reqwest::header::LINK)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or_default(),
            );
            let items: Vec<TreeEntry> = resp.json().await?;
            for item in items {
                if item.kind == "file" && item.path.ends_with(".bin") {
                    refs.push(ChunkRef {
                        platform: PLATFORM.to_string(),
                        repo: repo.clone(),
                        remote_path: item.path,
                        size: item.size,
                        ..ChunkRef::default()
                    });
                }
            }
        }
        Ok(refs)
    }
}

// ---- LFS / API response shapes ----------------------------------------------

#[derive(Deserialize)]
struct LfsBatchResponse {
    #[serde(default)]
    objects: Vec<LfsObject>,
}

#[derive(Deserialize)]
struct LfsObject {
    #[serde(default)]
    actions: LfsActions,
}

#[derive(Deserialize, Default)]
struct LfsActions {
    #[serde(default)]
    upload: LfsUpload,
}

#[derive(Deserialize, Default)]
struct LfsUpload {
    #[serde(default)]
    href: String,
    #[serde(default)]
    header: HashMap<String, String>,
}

#[derive(Deserialize)]
struct RepoInfo {
    #[serde(default)]
    siblings: Vec<Sibling>,
}

#[derive(Deserialize)]
struct Sibling {
    #[serde(default)]
    size: i64,
}

#[derive(Deserialize)]
struct TreeEntry {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    size: i64,
}

// ---- helpers ----------------------------------------------------------------

/// Build an NDJSON body (newline-delimited JSON objects) from the given entries.
fn build_ndjson(entries: &[serde_json::Value]) -> Vec<u8> {
    let mut out = Vec::new();
    for (i, e) in entries.iter().enumerate() {
        if i > 0 {
            out.push(b'\n');
        }
        out.extend_from_slice(&serde_json::to_vec(e).expect("serialize ndjson entry"));
    }
    out
}

/// Extract the rel="next" URL from an RFC 5988 `Link` header, as used by the
/// HuggingFace tree API for cursor pagination. Returns `None` for no next page.
fn parse_next_link(header: &str) -> Option<String> {
    if header.is_empty() {
        return None;
    }
    for part in header.split(',') {
        let segs: Vec<&str> = part.split(';').collect();
        if segs.len() < 2 {
            continue;
        }
        if !segs[1..].iter().any(|s| s.contains("rel=\"next\"")) {
            continue;
        }
        let url = segs[0]
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>')
            .to_string();
        return Some(url);
    }
    None
}

/// Exponential backoff: 2s, 4s, 8s for attempts 1, 2, 3 (Go: `2s * 2^(n-1)`).
fn backoff(attempt: u32) -> Duration {
    Duration::from_secs(2u64 << (attempt.saturating_sub(1)).min(3))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn hf() -> HuggingFace {
        HuggingFace::new("tok", "alice")
    }

    #[test]
    fn full_repo_normalizes_legacy_names() {
        let h = hf();
        assert_eq!(h.full_repo("bucket-01"), "alice/bucket-01");
        assert_eq!(h.full_repo("bob/bucket-01"), "bob/bucket-01");
    }

    #[test]
    fn ndjson_is_newline_delimited() {
        let body = build_ndjson(&[
            serde_json::json!({"key": "header", "value": {"summary": "x"}}),
            serde_json::json!({"key": "deletedFile", "value": {"path": "ab/cd.bin"}}),
        ]);
        let text = String::from_utf8(body).unwrap();
        let lines: Vec<&str> = text.split('\n').collect();
        assert_eq!(lines.len(), 2);
        // Each line is standalone valid JSON.
        for line in lines {
            let _: serde_json::Value = serde_json::from_str(line).unwrap();
        }
        assert!(text.contains("\"key\":\"header\""));
        assert!(text.contains("ab/cd.bin"));
    }

    #[test]
    fn parse_next_link_forms() {
        let h = "<https://huggingface.co/api/models/a/b/tree/main?cursor=xyz>; rel=\"next\"";
        assert_eq!(
            parse_next_link(h).as_deref(),
            Some("https://huggingface.co/api/models/a/b/tree/main?cursor=xyz")
        );
        // rel="prev" only → no next page.
        assert_eq!(parse_next_link("<https://x>; rel=\"prev\""), None);
        assert_eq!(parse_next_link(""), None);
        // Multiple links: pick the next one.
        let multi = "<https://x/prev>; rel=\"prev\", <https://x/next>; rel=\"next\"";
        assert_eq!(parse_next_link(multi).as_deref(), Some("https://x/next"));
    }

    #[test]
    fn classify_statuses() {
        assert!(matches!(
            classify(429, String::new(), Some(60), "commit"),
            AdapterError::RateLimited {
                platform: "huggingface",
                retry_after_secs: Some(60)
            }
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
    fn backoff_grows_then_caps() {
        let secs: Vec<u64> = (1..=6).map(|a| backoff(a).as_secs()).collect();
        assert_eq!(secs, vec![2, 4, 8, 16, 16, 16]);
    }
}
