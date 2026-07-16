//! Upload-side control-plane calls — port of `sidecar/api/upload.go` plus the
//! byos-direct additions (repo registration, direct confirm).

use super::client::{ApiError, Client};
use super::types::*;
use crate::types::RepoInfo;

impl Client {
    /// POST /api/upload/init
    pub async fn init_upload(
        &self,
        req: &UploadInitRequest,
    ) -> Result<UploadInitResponse, ApiError> {
        self.send_json(|http, base| http.post(format!("{base}/api/upload/init")).json(req))
            .await
    }

    /// PUT /api/upload/{sid}/chunk/{idx} — the server-relay path. Body is the
    /// encrypted chunk; integrity travels in headers.
    pub async fn upload_chunk(
        &self,
        session_id: &str,
        idx: i64,
        data: Vec<u8>,
        sha256: &str,
        compressed: bool,
    ) -> Result<(), ApiError> {
        let resp = self
            .send(|http, base| {
                http.put(format!("{base}/api/upload/{session_id}/chunk/{idx}"))
                    .header("X-Chunk-SHA256", sha256)
                    .header(
                        "X-Chunk-Compressed",
                        if compressed { "true" } else { "false" },
                    )
                    .header("Content-Type", "application/octet-stream")
                    .body(data.clone())
            })
            .await?;
        ok_or_status(resp).await
    }

    /// GET /api/upload/{sid}/status — chunk indices the backend already has, so
    /// a resumed streaming upload re-sends only the missing ones.
    pub async fn upload_status(&self, session_id: &str) -> Result<Vec<i64>, ApiError> {
        let resp: UploadStatusResponse = self
            .send_json(|http, base| http.get(format!("{base}/api/upload/{session_id}/status")))
            .await?;
        Ok(resp.uploaded_chunks)
    }

    /// POST /api/upload/{sid}/presign/{idx}
    pub async fn presign_chunk(
        &self,
        session_id: &str,
        idx: i64,
        sha256: &str,
        size: i64,
    ) -> Result<PresignResponse, ApiError> {
        let req = PresignRequest {
            sha256: sha256.to_string(),
            size,
        };
        self.send_json(|http, base| {
            http.post(format!("{base}/api/upload/{session_id}/presign/{idx}"))
                .json(&req)
        })
        .await
    }

    /// PUT to a presigned external URL (HuggingFace LFS). No bearer auth — the
    /// URL itself is the credential.
    pub async fn direct_upload_to_url(
        &self,
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        data: Vec<u8>,
    ) -> Result<(), ApiError> {
        let http = reqwest::Client::new();
        let mut req = http.put(url).body(data);
        for (k, v) in headers {
            req = req.header(k, v);
        }
        let resp = req.send().await?;
        if !resp.status().is_success() {
            return Err(ApiError::Status {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }

    /// POST /api/upload/{sid}/confirm/{idx} — metadata-only record of a chunk
    /// the client pushed itself (presign path or byos-direct).
    pub async fn confirm_chunk(
        &self,
        session_id: &str,
        idx: i64,
        req: &ConfirmChunkRequest,
    ) -> Result<(), ApiError> {
        let resp = self
            .send(|http, base| {
                http.post(format!("{base}/api/upload/{session_id}/confirm/{idx}"))
                    .json(req)
            })
            .await?;
        ok_or_status(resp).await
    }

    /// POST /api/upload/{sid}/complete
    pub async fn complete_upload(
        &self,
        session_id: &str,
        encrypted_size: i64,
        compressed_size: i64,
    ) -> Result<UploadCompleteResponse, ApiError> {
        let req = UploadCompleteRequest {
            encrypted_size,
            compressed_size,
        };
        self.send_json(|http, base| {
            http.post(format!("{base}/api/upload/{session_id}/complete"))
                .json(&req)
        })
        .await
    }

    /// DELETE /api/upload/{sid}
    pub async fn cancel_upload(&self, session_id: &str) -> Result<(), ApiError> {
        let resp = self
            .send(|http, base| http.delete(format!("{base}/api/upload/{session_id}")))
            .await?;
        ok_or_status(resp).await
    }

    /// DELETE /api/files/{id}/purge — permanently remove a file. When
    /// `client_deleted` is true the caller already removed the ciphertext from
    /// the user's own storage (byos-direct), so the server drops metadata only
    /// and never queues a platform deletion.
    pub async fn purge_file(&self, file_id: &str, client_deleted: bool) -> Result<(), ApiError> {
        let query = if client_deleted {
            "?client_deleted=true"
        } else {
            ""
        };
        let resp = self
            .send(|http, base| http.delete(format!("{base}/api/files/{file_id}/purge{query}")))
            .await?;
        ok_or_status(resp).await
    }

    // ── byos-direct control plane ────────────────────────────────────────────

    /// POST /api/repos/register — record a client-created repo.
    pub async fn register_repo(&self, repo: &RepoInfo) -> Result<(), ApiError> {
        let req = RegisterRepoRequest {
            id: &repo.id,
            platform: &repo.platform,
            account: &repo.account,
            name: &repo.name,
            url: &repo.url,
            max_bytes: repo.max_bytes,
        };
        let resp = self
            .send(|http, base| http.post(format!("{base}/api/repos/register")).json(&req))
            .await?;
        ok_or_status(resp).await
    }

    /// GET /api/repos?platform= — the user's registered repos (client pool state).
    pub async fn list_repos(&self, platform: &str) -> Result<Vec<RepoInfo>, ApiError> {
        let platform = platform.to_string();
        // The endpoint returns either a bare array or {repos:[...]} — accept both.
        let resp = self
            .send(|http, base| {
                http.get(format!("{base}/api/repos"))
                    .query(&[("platform", platform.clone())])
            })
            .await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(ApiError::Status {
                status: status.as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        let text = resp.text().await?;
        if let Ok(list) = serde_json::from_str::<Vec<RepoInfo>>(&text) {
            return Ok(list);
        }
        let wrapped: ReposResponse = serde_json::from_str(&text)
            .map_err(|e| ApiError::Other(format!("parse repos: {e}")))?;
        Ok(wrapped.repos)
    }
}

pub(super) async fn ok_or_status(resp: reqwest::Response) -> Result<(), ApiError> {
    let status = resp.status();
    if status.is_success() {
        return Ok(());
    }
    Err(ApiError::Status {
        status: status.as_u16(),
        body: resp.text().await.unwrap_or_default(),
    })
}
