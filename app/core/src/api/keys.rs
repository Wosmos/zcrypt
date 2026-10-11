//! Account key record (`GET /api/keys/me`).

use serde::Deserialize;

use super::client::{ApiError, Client};

/// The caller's own key record. Every field is optional on the wire so a server
/// that predates the account master key still decodes.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct MyKeyResponse {
    /// base64; "" when no account master key is set.
    #[serde(default)]
    pub wrapped_master_key: String,
    /// base64; salt of the account KEK.
    #[serde(default)]
    pub kdf_salt: String,
    #[serde(default)]
    pub master_key_writes: bool,
}

impl Client {
    /// GET /api/keys/me. The server answers JSON `null` before a keypair is
    /// published, which maps to `None`.
    pub async fn get_my_key(&self) -> Result<Option<MyKeyResponse>, ApiError> {
        self.send_json(|http, base| http.get(format!("{base}/api/keys/me")))
            .await
    }
}
