//! Download-side control-plane calls — port of `sidecar/api/download.go` plus
//! the byos-direct locators endpoint.

use super::client::{ApiError, Client};
use super::types::{ChunkDownload, FileLocatorsResponse, FileMetaResponse};

impl Client {
    /// GET /api/files/{id}/meta
    pub async fn get_file_meta(&self, file_id: &str) -> Result<FileMetaResponse, ApiError> {
        self.send_json(|http, base| http.get(format!("{base}/api/files/{file_id}/meta")))
            .await
    }

    /// GET /api/files/{id}/chunks/{idx} — relay download. Integrity metadata
    /// arrives in the X-Chunk-* headers.
    pub async fn get_chunk(&self, file_id: &str, idx: i64) -> Result<ChunkDownload, ApiError> {
        let resp = self
            .send(|http, base| http.get(format!("{base}/api/files/{file_id}/chunks/{idx}")))
            .await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(ApiError::Status {
                status: status.as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        let sha256 = header(&resp, "X-Chunk-SHA256");
        let compressed = header(&resp, "X-Chunk-Compressed") == "true";
        let data = resp.bytes().await?.to_vec();
        Ok(ChunkDownload {
            data,
            sha256,
            compressed,
        })
    }

    /// GET /api/files/{id}/locators — owner-only per-chunk platform locations
    /// for byos-direct downloads.
    pub async fn get_file_locators(&self, file_id: &str) -> Result<FileLocatorsResponse, ApiError> {
        self.send_json(|http, base| http.get(format!("{base}/api/files/{file_id}/locators")))
            .await
    }
}

fn header(resp: &reqwest::Response, name: &str) -> String {
    resp.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string()
}
