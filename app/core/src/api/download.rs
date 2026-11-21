//! Download-side control-plane calls, port of `sidecar/api/download.go` plus
//! the byos-direct locators endpoint.

use serde::Deserialize;

use super::client::{status_error, ApiError, Client};
use super::types::{ChunkDownload, FileLocatorsResponse, FileMetaResponse};

/// A short-lived platform URL for one chunk (GitHub, Hugging Face), so its
/// bytes skip the server and the transfer allowance.
#[derive(Debug, Clone, Deserialize)]
pub struct ChunkLink {
    pub url: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub compressed: bool,
}

impl Client {
    /// GET /api/files/{id}/meta
    pub async fn get_file_meta(&self, file_id: &str) -> Result<FileMetaResponse, ApiError> {
        self.send_json(|http, base| http.get(format!("{base}/api/files/{file_id}/meta")))
            .await
    }

    /// GET /api/files/{id}/chunks/{idx}, relay download. Integrity metadata
    /// arrives in the X-Chunk-* headers.
    pub async fn get_chunk(&self, file_id: &str, idx: i64) -> Result<ChunkDownload, ApiError> {
        let resp = self
            .send_download(|http, base| {
                http.get(format!("{base}/api/files/{file_id}/chunks/{idx}"))
            })
            .await?;
        if !resp.status().is_success() {
            return Err(status_error(resp).await);
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

    /// GET /api/files/{id}/chunks/{idx}/link. `None` (409) means this chunk has
    /// no link, e.g. a Hugging Face chunk still awaiting its commit.
    pub async fn get_chunk_link(
        &self,
        file_id: &str,
        idx: i64,
    ) -> Result<Option<ChunkLink>, ApiError> {
        match self
            .send_json(|http, base| {
                http.get(format!("{base}/api/files/{file_id}/chunks/{idx}/link"))
            })
            .await
        {
            Ok(link) => Ok(Some(link)),
            Err(ApiError::Status { status: 409, .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// GET a platform link. No bearer auth: the URL itself is the credential.
    pub async fn download_linked_chunk(&self, url: &str) -> Result<Vec<u8>, ApiError> {
        let resp = self.download_http().get(url).send().await?;
        if !resp.status().is_success() {
            return Err(status_error(resp).await);
        }
        Ok(resp.bytes().await?.to_vec())
    }

    /// GET /api/files/{id}/locators, owner-only per-chunk platform locations
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
