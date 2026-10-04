//! Core HTTP plumbing: bearer auth, single-flight 401 refresh, retry/backoff.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use hickory_resolver::config::{ResolverConfig, CLOUDFLARE};
use hickory_resolver::net::runtime::TokioRuntimeProvider;
use hickory_resolver::Resolver;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// A reqwest DNS resolver backed by hickory-resolver pointed at PUBLIC
/// nameservers (Cloudflare 1.1.1.1) with its own cache. The OS resolver on
/// macOS reads a stale/misconfigured /etc/resolv.conf and, under a large
/// download's concurrent-connection fan-out, intermittently returns EAI_NONAME
/// ("failed to lookup address information"): the DNS errors that stalled and
/// killed downloads while curl/the browser (using cached OS lookups) worked.
/// This gives one reliable, cached lookup per host, independent of the flaky
/// local resolver.
struct PublicDnsResolver {
    inner: Arc<Resolver<TokioRuntimeProvider>>,
}

impl PublicDnsResolver {
    // hickory 0.26 moved the Cloudflare preset from a ResolverConfig
    // constructor to a CLOUDFLARE ServerGroup constant, and made build()
    // fallible. Same servers, same UDP+TCP transport as before.
    // None when the resolver cannot be constructed, so the caller falls back to
    // reqwest's default (OS) resolver rather than failing to build a client at
    // all. The OS resolver is the flaky thing this exists to avoid, but a
    // degraded resolver beats no HTTP client.
    fn new() -> Option<Self> {
        match Resolver::builder_with_config(
            ResolverConfig::udp_and_tcp(&CLOUDFLARE),
            TokioRuntimeProvider::default(),
        )
        .build()
        {
            Ok(resolver) => Some(Self {
                inner: Arc::new(resolver),
            }),
            Err(e) => {
                eprintln!("zcrypt: public DNS resolver unavailable, using the OS resolver: {e}");
                None
            }
        }
    }
}

impl reqwest::dns::Resolve for PublicDnsResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let resolver = self.inner.clone();
        let host = name.as_str().to_string();
        Box::pin(async move {
            let lookup = resolver.lookup_ip(host.as_str()).await?;
            let addrs: reqwest::dns::Addrs =
                Box::new(lookup.into_iter().map(|ip| SocketAddr::new(ip, 0)));
            Ok(addrs)
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("api {status}: {body}")]
    Status { status: u16, body: String },
    #[error("unauthorized, token refresh failed")]
    Unauthorized,
    #[error("{0}")]
    Other(String),
}

impl ApiError {
    /// Full cause chain. reqwest 0.12's Display collapses every transport
    /// failure to a generic "error sending request for url (...)" and drops the
    /// underlying reason (DNS failure, connection reset, timeout, TLS), walk
    /// source() so a flaky/filtered-network failure is actually diagnosable.
    pub fn detail(&self) -> String {
        let mut out = self.to_string();
        let mut src = std::error::Error::source(self);
        while let Some(e) = src {
            out.push_str(" -> ");
            out.push_str(&e.to_string());
            src = e.source();
        }
        out
    }
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

fn user_id_from_token(access: &str) -> Option<String> {
    use base64::Engine as _;
    let payload = access.split('.').nth(1)?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.trim_end_matches('='))
        .ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    claims
        .get("sub")?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
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
        let mut http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            // Fail a stalled connect fast (flaky/filtered networks hang the
            // TCP/TLS handshake) so with_retry gets a chance instead of
            // burning the whole 30s budget on one dead attempt.
            .connect_timeout(Duration::from_secs(10));
        // Reliable public DNS (Cloudflare) + cache instead of the flaky OS
        // resolver that returns intermittent EAI_NONAME on macOS.
        if let Some(dns) = PublicDnsResolver::new() {
            http = http.dns_resolver(Arc::new(dns));
        }
        Client {
            base_url: base_url.trim_end_matches('/').to_string(),
            http: http.build().expect("reqwest client"),
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

    /// The signed-in user's id: the `sub` claim of the current access token. It
    /// salts the per-user name and content-MAC keys. The claim is only read,
    /// never trusted for authorization (the server does that).
    pub async fn user_id(&self) -> Result<String, ApiError> {
        user_id_from_token(&self.access_token().await)
            .ok_or_else(|| ApiError::Other("cannot read the user id from the session token".into()))
    }

    pub async fn tokens(&self) -> (String, String) {
        let t = self.tokens.lock().await;
        (t.access.clone(), t.refresh.clone())
    }

    /// Replace the tokens in place, so every in-flight transfer holding this
    /// client picks them up (a fresh login in the webview, say).
    pub async fn set_tokens(&self, access: &str, refresh: &str) {
        let mut t = self.tokens.lock().await;
        t.access = access.into();
        t.refresh = refresh.into();
    }

    /// Rotate now and return the new (access, refresh) pair. The webview calls
    /// this instead of refreshing on its own, so one chain serves both.
    pub async fn force_refresh(&self) -> Result<(String, String), ApiError> {
        let stale = self.access_token().await;
        self.refresh(&stale).await?;
        Ok(self.tokens().await)
    }

    /// Refresh the access token once (single-flight via the token mutex).
    /// `stale` is the access token the caller saw rejected: if another task
    /// already rotated past it while we waited for the lock, reuse that result
    /// instead of rotating again.
    /// Mirrors `client.go refreshToken` → POST /api/auth/refresh.
    async fn refresh(&self, stale: &str) -> Result<(), ApiError> {
        let mut tokens = self.tokens.lock().await;
        if tokens.access != stale {
            return Ok(());
        }
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
    /// each attempt (bodies aren't reusable. This also fixes the sidecar's
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
        self.refresh(&token).await?;
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
    /// (500ms · 2^n, capped 8s). Real backoff: the Go helper was a no-op.
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
                    // Don't burn retries on auth failures or a definitive
                    // client error (404 for a non-owner's locators, a deleted
                    // file): only transient failures can improve on a retry.
                    if !is_retryable(&e) {
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

fn is_retryable(e: &ApiError) -> bool {
    match e {
        ApiError::Unauthorized => false,
        ApiError::Status { status, .. } => {
            !(400..500).contains(status) || matches!(status, 408 | 429)
        }
        _ => true,
    }
}

#[cfg(test)]
mod user_id_tests {
    use super::*;
    use base64::Engine as _;

    fn token(payload: &str) -> String {
        let b = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!("{}.{}.sig", b.encode("{}"), b.encode(payload))
    }

    #[test]
    fn reads_sub_from_an_access_token() {
        let uid = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            user_id_from_token(&token(&format!(r#"{{"sub":"{uid}","role":"user"}}"#))),
            Some(uid)
        );
    }

    #[test]
    fn rejects_tokens_without_a_usable_sub() {
        assert_eq!(user_id_from_token(""), None);
        assert_eq!(user_id_from_token("not-a-jwt"), None);
        assert_eq!(user_id_from_token(&token(r#"{"sub":""}"#)), None);
        assert_eq!(user_id_from_token(&token(r#"{"role":"user"}"#)), None);
    }
}

#[cfg(test)]
mod retry_tests {
    use super::*;

    fn status(s: u16) -> ApiError {
        ApiError::Status {
            status: s,
            body: String::new(),
        }
    }

    #[test]
    fn only_transient_errors_retry() {
        assert!(!is_retryable(&ApiError::Unauthorized));
        assert!(!is_retryable(&status(404)));
        assert!(!is_retryable(&status(403)));
        assert!(is_retryable(&status(408)));
        assert!(is_retryable(&status(429)));
        assert!(is_retryable(&status(502)));
        assert!(is_retryable(&ApiError::Other("x".into())));
    }
}
