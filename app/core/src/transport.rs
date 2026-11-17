//! Shared transfer rule: a transfer fails only after `IDLE_TIMEOUT` with no
//! bytes moving, never because it took long overall. Downloads use reqwest's
//! per-read `read_timeout`; uploads, whose request body reqwest does not time,
//! run under an [`Idle`] watchdog fed by the body as it is drained. Small JSON
//! control calls keep a short total timeout (`CONTROL_TIMEOUT`).

use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;

pub const IDLE_TIMEOUT: Duration = Duration::from_secs(60);
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub const CONTROL_TIMEOUT: Duration = Duration::from_secs(30);

const BODY_SLICE: usize = 64 * 1024;
const RETRY_AFTER_CAP_SECS: u64 = 300;

#[derive(Debug, Clone, Copy, thiserror::Error)]
#[error("stalled: no bytes moved for {}s", .0.as_secs_f32())]
pub struct Stalled(pub Duration);

/// Client for response bodies: connect timeout plus a per-read idle timeout.
pub fn download_client(idle: Duration) -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(idle)
}

/// Client for request bodies: connect timeout only. Pair every send with
/// [`Idle::guard`], since reqwest's read timeout would also cut a slow upload.
pub fn upload_client() -> reqwest::ClientBuilder {
    reqwest::Client::builder().connect_timeout(CONNECT_TIMEOUT)
}

/// Idle watchdog for one upload request.
#[derive(Clone)]
pub struct Idle {
    start: Instant,
    last_ms: Arc<AtomicU64>,
    limit: Duration,
}

impl Idle {
    pub fn new(limit: Duration) -> Self {
        Self {
            start: Instant::now(),
            last_ms: Arc::new(AtomicU64::new(0)),
            limit,
        }
    }

    pub fn touch(&self) {
        self.last_ms
            .store(self.start.elapsed().as_millis() as u64, Ordering::Relaxed);
    }

    fn deadline(&self) -> Instant {
        self.start + Duration::from_millis(self.last_ms.load(Ordering::Relaxed)) + self.limit
    }

    /// A request body that marks progress each time the transport takes a slice.
    pub fn body(&self, data: Bytes) -> reqwest::Body {
        let idle = self.clone();
        let stream = futures_util::stream::unfold((data, 0usize), move |(data, off)| {
            let idle = idle.clone();
            async move {
                if off >= data.len() {
                    return None;
                }
                idle.touch();
                let end = (off + BODY_SLICE).min(data.len());
                let piece = data.slice(off..end);
                Some((Ok::<Bytes, std::io::Error>(piece), (data, end)))
            }
        });
        reqwest::Body::wrap_stream(stream)
    }

    /// Runs `fut`, failing with [`Stalled`] once `limit` passes with no progress.
    pub async fn guard<T, E, F>(&self, fut: F) -> Result<T, E>
    where
        E: From<Stalled>,
        F: Future<Output = Result<T, E>>,
    {
        self.touch();
        tokio::pin!(fut);
        loop {
            let deadline = self.deadline();
            tokio::select! {
                r = &mut fut => return r,
                _ = tokio::time::sleep_until(tokio::time::Instant::from_std(deadline)) => {
                    if self.deadline() <= Instant::now() {
                        return Err(Stalled(self.limit).into());
                    }
                }
            }
        }
    }
}

/// Exponential backoff with jitter: `base << attempt`, capped, then a random
/// point in its upper half so concurrent retries do not move in lockstep.
pub fn backoff(attempt: u32, base_ms: u64, cap_ms: u64) -> Duration {
    let d = (base_ms << attempt.min(16)).min(cap_ms);
    let mut b = [0u8; 8];
    crate::crypto::fill_random(&mut b);
    let spread = u64::from_le_bytes(b) % (d / 2 + 1);
    Duration::from_millis(d / 2 + spread)
}

/// The longer of a backoff delay and a server's `Retry-After`.
pub fn honor_retry_after(delay: Duration, retry_after_secs: Option<u64>) -> Duration {
    match retry_after_secs {
        Some(s) => delay.max(Duration::from_secs(s.min(RETRY_AFTER_CAP_SECS))),
        None => delay,
    }
}

/// Seconds from a `Retry-After` header, when present and numeric.
pub fn retry_after_secs(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug)]
    struct E(#[allow(dead_code)] Stalled);
    impl From<Stalled> for E {
        fn from(s: Stalled) -> Self {
            E(s)
        }
    }

    #[tokio::test]
    async fn progress_keeps_a_long_transfer_alive_past_the_idle_limit() {
        let idle = Idle::new(Duration::from_millis(300));
        let feeder = idle.clone();
        let started = Instant::now();
        let r: Result<(), E> = idle
            .guard(async {
                for _ in 0..8 {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    feeder.touch();
                }
                Ok(())
            })
            .await;
        assert!(r.is_ok());
        assert!(started.elapsed() > Duration::from_millis(300));
    }

    #[tokio::test]
    async fn no_progress_fails_after_the_idle_limit() {
        let idle = Idle::new(Duration::from_millis(200));
        let started = Instant::now();
        let r: Result<(), E> = idle
            .guard(async {
                tokio::time::sleep(Duration::from_secs(30)).await;
                Ok(())
            })
            .await;
        assert!(r.is_err());
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn backoff_stays_within_its_jitter_band_and_cap() {
        for attempt in 0..20 {
            let d = backoff(attempt, 500, 8_000);
            let full = (500u64 << attempt.min(16)).min(8_000);
            assert!(d >= Duration::from_millis(full / 2));
            assert!(d <= Duration::from_millis(full));
        }
    }

    #[test]
    fn retry_after_lengthens_but_never_shortens_a_delay() {
        let d = Duration::from_secs(2);
        assert_eq!(honor_retry_after(d, Some(30)), Duration::from_secs(30));
        assert_eq!(honor_retry_after(d, Some(1)), d);
        assert_eq!(honor_retry_after(d, None), d);
        assert_eq!(
            honor_retry_after(d, Some(86_400)),
            Duration::from_secs(RETRY_AFTER_CAP_SECS)
        );
    }
}
