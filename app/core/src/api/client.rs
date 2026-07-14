//! Core HTTP plumbing: bearer auth, single-flight 401 refresh, retry/backoff.

use std::sync::Arc;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("api {status}: {body}")]
    Status { status: u16, body: String },
    #[error("unauthorized — token refresh failed")]
    Unauthorized,
    #[error("{0}")]
    Other(String),
}

/// Mutable token state. The shell seeds it (from the OS keychain) and observes
/// rotations via `on_rotate` so refreshed tokens are persisted back.
#[derive(Default)]
pub struct TokenState {
    pub access: String,
    pub refresh: String,
}

type RotateHook = Arc<dyn Fn(&str, &str) + Send + Sync>;

pub struct Client {
    pub base_url: String,
    http: reqwest::Client,
    tokens: Mutex<TokenState>,
    /// Called with (access, refresh) after a successful rotation.
    on_rotate: Option<RotateHook>,
}

#[derive(Serialize)]
struct RefreshRequest<'a> {
    refresh_token: &'a str,
}

#[derive(Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: String,
}

impl Client {
    pub fn new(base_url: &str, access: &str, refresh: &str) -> Self {
        Client {
            base_url: base_url.trim_end_matches('/').to_string(),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
            tokens: Mutex::new(TokenState {
                access: access.into(),
                refresh: refresh.into(),
            }),
            on_rotate: None,
        }
    }

    pub fn with_rotate_hook(mut self, hook: RotateHook) -> Self {
        self.on_rotate = Some(hook);
        self
    }

    pub async fn access_token(&self) -> String {
        self.tokens.lock().await.access.clone()
    }

    /// Refresh the access token once (single-flight via the token mutex).
    /// Mirrors `client.go refreshToken` → POST /api/auth/refresh.
    async fn refresh(&self) -> Result<(), ApiError> {
        let mut tokens = self.tokens.lock().await;
        if tokens.refresh.is_empty() {
            return Err(ApiError::Unauthorized);
        }
        let resp = self
            .http
            .post(format!("{}/api/auth/refresh", self.base_url))
            .json(&RefreshRequest {
                refresh_token: &tokens.refresh,
            })
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(ApiError::Unauthorized);
        }
        let body: RefreshResponse = resp.json().await?;
        tokens.access = body.access_token;
        tokens.refresh = body.refresh_token;
        if let Some(hook) = &self.on_rotate {
            hook(&tokens.access, &tokens.refresh);
        }
        Ok(())
    }

    /// Send a request with bearer auth; on 401, refresh once and retry.
    /// `build` receives (http, base_url) and must produce a fresh RequestBuilder
    /// each attempt (bodies aren't reusable — this also fixes the sidecar's
    /// consumed-body-on-retry bug).
    pub async fn send<F>(&self, build: F) -> Result<reqwest::Response, ApiError>
    where
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        let token = self.access_token().await;
        let resp = build(&self.http, &self.base_url)
            .bearer_auth(&token)
            .send()
            .await?;
        if resp.status().as_u16() != 401 {
            return Ok(resp);
        }
        self.refresh().await?;
        let token = self.access_token().await;
        Ok(build(&self.http, &self.base_url)
            .bearer_auth(&token)
            .send()
            .await?)
    }

    /// `send` + JSON-decode, mapping non-2xx to `ApiError::Status`.
    pub async fn send_json<T, F>(&self, build: F) -> Result<T, ApiError>
    where
        T: DeserializeOwned,
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        let resp = self.send(build).await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(ApiError::Status {
                status: status.as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(resp.json().await?)
    }

    /// Retry `op` up to `attempts` times with exponential backoff
    /// (500ms · 2^n, capped 8s). Real backoff — the Go helper was a no-op.
    pub async fn with_retry<T, Fut, Op>(&self, attempts: u32, mut op: Op) -> Result<T, ApiError>
    where
        Op: FnMut() -> Fut,
        Fut: std::future::Future<Output = Result<T, ApiError>>,
    {
        let mut last: Option<ApiError> = None;
        for n in 0..attempts {
            match op().await {
                Ok(v) => return Ok(v),
                Err(e) => {
                    // Don't burn retries on auth failures.
                    if matches!(e, ApiError::Unauthorized) {
                        return Err(e);
                    }
                    last = Some(e);
                    if n + 1 < attempts {
                        let delay = Duration::from_millis((500u64 << n).min(8_000));
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        Err(last.unwrap_or(ApiError::Other("retry: no attempts".into())))
    }
}
