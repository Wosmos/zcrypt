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

use crate::transport::{
    backoff, download_client, honor_retry_after, retry_after_secs, upload_client, Idle,
    CONNECT_TIMEOUT, CONTROL_TIMEOUT, IDLE_TIMEOUT,
};

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
    #[error("api 429: {body}")]
    RateLimited {
        retry_after_secs: Option<u64>,
        body: String,
    },
    #[error("unauthorized, token refresh failed")]
    Unauthorized,
    #[error("{0}")]
    Stalled(#[from] crate::transport::Stalled),
    #[error("{0}")]
    Other(String),
}

impl ApiError {
    /// Whether a retry can improve on this failure: network trouble, a stall,
    /// 408, 429 and 5xx. Auth failures and other 4xx are final.
    pub fn is_transient(&self) -> bool {
        match self {
            ApiError::Unauthorized => false,
            ApiError::Status { status, .. } => {
                !(400..500).contains(status) || matches!(status, 408 | 429)
            }
            ApiError::Http(e) => !e.is_builder(),
            ApiError::RateLimited { .. } | ApiError::Stalled(_) => true,
            ApiError::Other(_) => true,
        }
    }

    pub fn retry_after_secs(&self) -> Option<u64> {
        match self {
            ApiError::RateLimited {
                retry_after_secs, ..
            } => *retry_after_secs,
            _ => None,
        }
    }

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

/// Header naming the app on every API call ("desktop-windows/0.2.3"). The
/// server holds a session to the kind of app that started it, and the desktop
/// webview sends the same platform, so the engine and the window share one
/// session while a token copied into another program does not.
pub const CLIENT_HEADER: &str = "X-Zcrypt-Client";

static CLIENT_MARKER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// The platform part of this build's marker.
pub fn client_platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "windows") {
        "desktop-windows"
    } else if cfg!(target_os = "macos") {
        "desktop-macos"
    } else {
        "desktop-linux"
    }
}

/// Sets the app version the marker reports; the shell calls it once at
/// start-up. Without it the engine reports its own crate version.
pub fn set_app_version(version: &str) {
    let _ = CLIENT_MARKER.set(format!("{}/{}", client_platform(), clean_version(version)));
}

/// This build's marker.
pub fn client_marker() -> &'static str {
    CLIENT_MARKER.get_or_init(|| format!("{}/{}", client_platform(), env!("CARGO_PKG_VERSION")))
}

fn clean_version(v: &str) -> String {
    let v: String = v
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '+' | '-'))
        .take(24)
        .collect();
    if v.is_empty() {
        "0".into()
    } else {
        v
    }
}

fn marker_headers() -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    if let Ok(v) = reqwest::header::HeaderValue::from_str(client_marker()) {
        h.insert(CLIENT_HEADER, v);
    }
    h
}

pub struct Client {
    pub base_url: String,
    /// JSON control calls: short total timeout.
    http: reqwest::Client,
    /// Chunk and presigned-URL downloads: per-read idle timeout.
    down: reqwest::Client,
    /// Chunk and presigned-URL uploads: guarded by an [`Idle`] watchdog.
    up: reqwest::Client,
    idle: Duration,
    tokens: Mutex<TokenState>,
    /// Called with (access, refresh) after a successful rotation.
    on_rotate: Option<RotateHook>,
}

fn token_claims(access: &str) -> Option<serde_json::Value> {
    use base64::Engine as _;
    let payload = access.split('.').nth(1)?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.trim_end_matches('='))
        .ok()?;
    serde_json::from_slice(&raw).ok()
}

fn user_id_from_token(access: &str) -> Option<String> {
    token_claims(access)?
        .get("sub")?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// When the access token was issued. Every refresh mints a later one, so of two
/// pairs from the same session the later-issued one is the live one.
fn issued_at(access: &str) -> Option<i64> {
    token_claims(access)?.get("iat")?.as_i64()
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
        Self::with_idle(base_url, access, refresh, IDLE_TIMEOUT)
    }

    pub fn with_idle(base_url: &str, access: &str, refresh: &str, idle: Duration) -> Self {
        // Reliable public DNS (Cloudflare) + cache instead of the flaky OS
        // resolver that returns intermittent EAI_NONAME on macOS.
        let dns = PublicDnsResolver::new().map(Arc::new);
        let finish = |mut b: reqwest::ClientBuilder| {
            b = b
                .default_headers(marker_headers())
                .user_agent(format!("zcrypt/{}", client_marker()));
            if let Some(dns) = &dns {
                b = b.dns_resolver(dns.clone());
            }
            b.build().expect("reqwest client")
        };
        Client {
            base_url: base_url.trim_end_matches('/').to_string(),
            http: finish(
                reqwest::Client::builder()
                    .timeout(CONTROL_TIMEOUT)
                    .connect_timeout(CONNECT_TIMEOUT),
            ),
            down: finish(download_client(idle)),
            up: finish(upload_client()),
            idle,
            tokens: Mutex::new(TokenState {
                access: access.into(),
                refresh: refresh.into(),
            }),
            on_rotate: None,
        }
    }

    pub(super) fn idle(&self) -> Idle {
        Idle::new(self.idle)
    }

    pub(super) fn upload_http(&self) -> &reqwest::Client {
        &self.up
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
    /// client picks them up (a fresh login in the webview, say), unless the
    /// pair held is newer: a window that reopens with the pair it saved before
    /// the engine rotated must not put a spent refresh token back in the engine.
    /// A held pair whose refresh was rejected is always replaced. Returns
    /// whether the pair was taken.
    pub async fn offer_tokens(&self, access: &str, refresh: &str) -> bool {
        let mut t = self.tokens.lock().await;
        if t.access == access && t.refresh == refresh {
            return false;
        }
        if !t.refresh.is_empty() && issued_at(access) < issued_at(&t.access) {
            return false;
        }
        t.access = access.into();
        t.refresh = refresh.into();
        true
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
        let status = resp.status().as_u16();
        if matches!(status, 401 | 403) {
            // Spent or revoked: forget it, so every caller fails at once instead
            // of each sending it again, until a new pair arrives.
            tokens.refresh.clear();
            return Err(ApiError::Unauthorized);
        }
        if !resp.status().is_success() {
            return Err(status_error(resp).await);
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
        self.send_on(&self.http, build).await
    }

    pub(super) async fn send_download<F>(&self, build: F) -> Result<reqwest::Response, ApiError>
    where
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        self.send_on(&self.down, build).await
    }

    pub(super) async fn send_upload<F>(&self, build: F) -> Result<reqwest::Response, ApiError>
    where
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        self.send_on(&self.up, build).await
    }

    async fn send_on<F>(
        &self,
        http: &reqwest::Client,
        build: F,
    ) -> Result<reqwest::Response, ApiError>
    where
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        let token = self.access_token().await;
        let resp = build(http, &self.base_url)
            .bearer_auth(&token)
            .send()
            .await?;
        if resp.status().as_u16() != 401 {
            return Ok(resp);
        }
        self.refresh(&token).await?;
        let token = self.access_token().await;
        let resp = build(http, &self.base_url)
            .bearer_auth(&token)
            .send()
            .await?;
        if resp.status().as_u16() == 401 {
            return Err(ApiError::Unauthorized);
        }
        Ok(resp)
    }

    /// `send` + JSON-decode, mapping non-2xx to `ApiError::Status`.
    pub async fn send_json<T, F>(&self, build: F) -> Result<T, ApiError>
    where
        T: DeserializeOwned,
        F: Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
    {
        let resp = self.send(build).await?;
        if !resp.status().is_success() {
            return Err(status_error(resp).await);
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
                    if !e.is_transient() {
                        return Err(e);
                    }
                    last = Some(e);
                    if n + 1 < attempts {
                        let delay = honor_retry_after(
                            backoff(n, 500, 8_000),
                            last.as_ref().and_then(ApiError::retry_after_secs),
                        );
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        Err(last.unwrap_or(ApiError::Other("retry: no attempts".into())))
    }
}

/// A failed response as an `ApiError`: 429 keeps its `Retry-After`.
pub(super) async fn status_error(resp: reqwest::Response) -> ApiError {
    let status = resp.status().as_u16();
    let retry_after_secs = retry_after_secs(resp.headers());
    let body = resp.text().await.unwrap_or_default();
    if status == 429 {
        ApiError::RateLimited {
            retry_after_secs,
            body,
        }
    } else {
        ApiError::Status { status, body }
    }
}

#[cfg(test)]
mod token_tests {
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

    #[tokio::test]
    async fn keeps_the_newer_pair_it_holds() {
        let held = token(r#"{"sub":"u","iat":200}"#);
        let older = token(r#"{"sub":"u","iat":100}"#);
        let newer = token(r#"{"sub":"u","iat":300}"#);
        let client = Client::new("http://127.0.0.1:0", &held, "r2");

        assert!(!client.offer_tokens(&older, "r1").await);
        assert!(!client.offer_tokens(&held, "r2").await);
        assert_eq!(client.tokens().await, (held.clone(), "r2".into()));

        assert!(client.offer_tokens(&newer, "r3").await);
        assert_eq!(client.tokens().await, (newer, "r3".into()));
    }

    #[tokio::test]
    async fn a_rejected_refresh_fails_fast_until_a_new_pair_arrives() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let seen = hits.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            while let Ok((mut sock, _)) = listener.accept().await {
                seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf).await;
                let _ = sock
                    .write_all(b"HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
                    .await;
            }
        });
        let held = token(r#"{"sub":"u","iat":200}"#);
        let client = Client::new(&base, &held, "spent");

        assert!(matches!(
            client.force_refresh().await,
            Err(ApiError::Unauthorized)
        ));
        assert!(matches!(
            client.force_refresh().await,
            Err(ApiError::Unauthorized)
        ));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);

        let older = token(r#"{"sub":"u","iat":100}"#);
        assert!(client.offer_tokens(&older, "fresh").await);
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

    #[test]
    fn marker_names_this_platform_and_a_clean_version() {
        let m = super::client_marker();
        let (platform, version) = m.split_once('/').expect("platform/version");
        assert_eq!(platform, super::client_platform());
        assert!(!version.is_empty());
        assert_eq!(super::clean_version("0.2.3"), "0.2.3");
        assert_eq!(super::clean_version("1.0 beta!"), "1.0beta");
        assert_eq!(super::clean_version(""), "0");
        assert_eq!(super::clean_version(&"9".repeat(40)).len(), 24);
        assert!(super::marker_headers().contains_key(super::CLIENT_HEADER));
    }

    use super::*;

    fn status(s: u16) -> ApiError {
        ApiError::Status {
            status: s,
            body: String::new(),
        }
    }

    #[test]
    fn only_transient_errors_retry() {
        assert!(!ApiError::Unauthorized.is_transient());
        assert!(!status(404).is_transient());
        assert!(!status(403).is_transient());
        assert!(status(408).is_transient());
        assert!(status(502).is_transient());
        assert!(ApiError::Other("x".into()).is_transient());
        assert!(ApiError::RateLimited {
            retry_after_secs: None,
            body: String::new()
        }
        .is_transient());
    }
}

#[cfg(test)]
mod transfer_tests {
    use super::*;
    use crate::testutil::{serve, Reply};
    use bytes::Bytes;
    use std::time::Instant;

    const IDLE: Duration = Duration::from_millis(400);

    #[tokio::test]
    async fn a_slow_but_moving_chunk_download_outlives_the_idle_limit() {
        let body = vec![7u8; 24];
        let (base, _) = serve(move |_, _| Reply::Trickle {
            body: body.clone(),
            piece: 1,
            gap: Duration::from_millis(50),
        })
        .await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let started = Instant::now();
        let chunk = client.get_chunk("f", 0).await.unwrap();
        assert_eq!(chunk.data.len(), 24);
        assert!(started.elapsed() > IDLE);
    }

    #[tokio::test]
    async fn a_stalled_chunk_download_fails_near_the_idle_limit() {
        let (base, _) = serve(|_, _| Reply::StallBody {
            declared: 1000,
            sent: vec![1; 10],
        })
        .await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let started = Instant::now();
        assert!(client.get_chunk("f", 0).await.is_err());
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[tokio::test]
    async fn a_chunk_upload_sends_its_length_and_bytes() {
        let seen = Arc::new(std::sync::Mutex::new((0usize, String::new())));
        let record = seen.clone();
        let (base, _) = serve(move |_, req| {
            *record.lock().unwrap() = (
                req.body.len(),
                req.headers
                    .get("content-length")
                    .cloned()
                    .unwrap_or_default(),
            );
            Reply::status(200, "{}")
        })
        .await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let data = Bytes::from(vec![9u8; 300_000]);
        client
            .upload_chunk("s", 0, data, "abc", false)
            .await
            .unwrap();
        assert_eq!(*seen.lock().unwrap(), (300_000, "300000".to_string()));
    }

    #[tokio::test]
    async fn a_chunk_upload_the_server_never_answers_fails_near_the_idle_limit() {
        let (base, _) = serve(|_, _| Reply::Hang).await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let started = Instant::now();
        let r = client
            .upload_chunk("s", 0, Bytes::from(vec![1u8; 1024]), "abc", false)
            .await;
        assert!(matches!(r, Err(ApiError::Stalled(_))));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[tokio::test]
    async fn a_presigned_put_the_server_never_answers_fails_instead_of_hanging() {
        let (base, _) = serve(|_, _| Reply::Hang).await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let started = Instant::now();
        let r = client
            .direct_upload_to_url(
                &format!("{base}/put"),
                &Default::default(),
                Bytes::from(vec![1u8; 1024]),
            )
            .await;
        assert!(matches!(r, Err(ApiError::Stalled(_))));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[tokio::test]
    async fn a_second_401_after_a_refresh_is_unauthorized_not_retryable() {
        let (base, _) = serve(|_, req| {
            if req.path.starts_with("/api/auth/refresh") {
                Reply::status(200, r#"{"access_token":"a2","refresh_token":"r2"}"#)
            } else {
                Reply::status(401, "")
            }
        })
        .await;
        let client = Client::with_idle(&base, "a1", "r1", IDLE);
        let err = client.get_chunk("f", 0).await.err().unwrap();
        assert!(matches!(err, ApiError::Unauthorized), "{err:?}");
        assert!(!err.is_transient());
    }

    #[tokio::test]
    async fn a_429_keeps_its_retry_after() {
        let (base, _) =
            serve(|_, _| Reply::with_header(429, "retry-after", "7", "slow down")).await;
        let client = Client::with_idle(&base, "t", "r", IDLE);
        let err = client.get_chunk("f", 0).await.err().unwrap();
        assert_eq!(err.retry_after_secs(), Some(7));
        assert!(err.is_transient());
    }
}
