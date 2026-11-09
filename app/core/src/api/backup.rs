//! Control-plane calls automatic backup needs: create the folders it mirrors
//! and move a replaced file version to the trash.

use serde::Deserialize;
use serde_json::json;

use super::client::{ApiError, Client};

#[derive(Debug, Deserialize)]
struct CreatedFolder {
    id: String,
}

impl Client {
    /// POST /api/folders. `encrypted_name` is already sealed (pk1 for backup).
    pub async fn create_folder(
        &self,
        encrypted_name: &str,
        parent_id: Option<&str>,
    ) -> Result<String, ApiError> {
        let body = match parent_id {
            Some(p) => json!({ "encrypted_name": encrypted_name, "parent_id": p }),
            None => json!({ "encrypted_name": encrypted_name }),
        };
        let created: CreatedFolder = self
            .send_json(|http, base| http.post(format!("{base}/api/folders")).json(&body))
            .await?;
        Ok(created.id)
    }

    /// DELETE /api/files/{id}: moves the file to the trash (recoverable).
    pub async fn trash_file(&self, file_id: &str) -> Result<(), ApiError> {
        let resp = self
            .send(|http, base| http.delete(format!("{base}/api/files/{file_id}")))
            .await?;
        let status = resp.status();
        if status.is_success() || status.as_u16() == 404 {
            return Ok(());
        }
        Err(ApiError::Status {
            status: status.as_u16(),
            body: resp.text().await.unwrap_or_default(),
        })
    }
}
