//! Control-plane request/response types — port of `sidecar/api/types.go`
//! (wire-identical JSON), plus the new byos-direct types (locators, repo
//! registration, direct confirm).

use serde::{Deserialize, Serialize};

use crate::types::RepoInfo;

// ─── Upload ────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize)]
pub struct UploadInitRequest {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub filename: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub encrypted_name: String,
    pub original_size: i64,
    pub sha256: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub sha256_scheme: String,
    /// base64
    pub salt: String,
    /// base64 envelope-wrapped CEK
    pub wrapped_cek: String,
    pub chunk_count: i64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub platform: String,
    /// "" (relay) or "byos-direct" — see docs/DESKTOP_ARCHITECTURE.md.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub mode: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UploadStatusResponse {
    #[serde(default)]
    pub uploaded_chunks: Vec<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UploadInitResponse {
    pub session_id: String,
    pub file_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub repo_url: String,
    #[serde(default)]
    pub direct_upload: bool,
    #[serde(default)]
    pub resumed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PresignRequest {
    pub sha256: String,
    pub size: i64,
}

/// Deserialize a field that may be JSON `null` into its `Default` — `#[serde(default)]`
/// alone only covers a MISSING key, not an explicit `null`. HuggingFace's LFS
/// dedup path returns `"upload_headers": null` when the blob already exists, and
/// without this the client couldn't decode the presign response at all (the
/// upload died at the first already-present chunk).
fn null_default<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PresignResponse {
    #[serde(default, deserialize_with = "null_default")]
    pub upload_url: String,
    #[serde(default, deserialize_with = "null_default")]
    pub upload_headers: std::collections::HashMap<String, String>,
    #[serde(default, deserialize_with = "null_default")]
    pub remote_path: String,
    #[serde(default, deserialize_with = "null_default")]
    pub already_exists: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ConfirmChunkRequest {
    pub sha256: String,
    pub size: i64,
    pub remote_path: String,
    pub compressed: bool,
    // byos-direct extras — the client uploaded with its own token and reports
    // where the chunk lives. Empty/false on the relay/presign paths.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub platform: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub account: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub repo_id: String,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub committed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct UploadCompleteRequest {
    pub encrypted_size: i64,
    pub compressed_size: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UploadCompleteResponse {
    pub success: bool,
    #[serde(default)]
    pub file_id: String,
}

// ─── Download ──────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FileMetaResponse {
    pub id: String,
    #[serde(default)]
    pub original_name: String,
    #[serde(default)]
    pub encrypted_name: String,
    pub original_size: i64,
    #[serde(default)]
    pub compressed_size: i64,
    #[serde(default)]
    pub encrypted_size: i64,
    pub chunk_count: i64,
    pub sha256: String,
    #[serde(default)]
    pub sha256_scheme: String,
    /// base64
    #[serde(default)]
    pub salt: String,
    /// base64 envelope-wrapped CEK (empty for legacy files)
    #[serde(default)]
    pub wrapped_cek: String,
    #[serde(default)]
    pub status: String,
}

/// One downloaded chunk from the relay.
pub struct ChunkDownload {
    pub data: Vec<u8>,
    pub sha256: String,
    pub compressed: bool,
}

/// Per-chunk locator for byos-direct downloads (GET /api/files/{id}/locators).
#[derive(Debug, Clone, Deserialize)]
pub struct ChunkLocator {
    pub index: i64,
    pub platform: String,
    #[serde(default)]
    pub account: String,
    #[serde(default)]
    pub repo: String,
    pub remote_path: String,
    pub size: i64,
    pub sha256: String,
    pub compressed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileLocatorsResponse {
    pub file_id: String,
    pub chunks: Vec<ChunkLocator>,
}

// ─── Repos (byos-direct registration) ─────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RegisterRepoRequest<'a> {
    pub id: &'a str,
    pub platform: &'a str,
    pub account: &'a str,
    pub name: &'a str,
    pub url: &'a str,
    pub max_bytes: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ReposResponse {
    #[serde(default)]
    pub repos: Vec<RepoInfo>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // HF's LFS dedup path returns `"upload_headers": null` (blob already exists).
    // This must decode — before null_default it errored and killed the upload.
    #[test]
    fn presign_response_tolerates_null_headers() {
        let r: PresignResponse = serde_json::from_str(
            r#"{"upload_url":"","upload_headers":null,"remote_path":"ab/cd.bin","already_exists":true}"#,
        )
        .expect("null upload_headers must decode");
        assert!(r.already_exists);
        assert!(r.upload_headers.is_empty());
        assert_eq!(r.remote_path, "ab/cd.bin");
    }

    #[test]
    fn presign_response_normal_headers() {
        let r: PresignResponse = serde_json::from_str(
            r#"{"upload_url":"https://hf/x","upload_headers":{"Authorization":"Bearer z"},"already_exists":false}"#,
        )
        .unwrap();
        assert!(!r.already_exists);
        assert_eq!(
            r.upload_headers.get("Authorization").map(String::as_str),
            Some("Bearer z")
        );
    }
}
