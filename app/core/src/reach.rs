//! Reachability of a platform origin from THIS network, plus the wake signal
//! that lets a "Try again" press cut every waiting transfer's sleep short.
//! Any HTTP answer counts as reachable; a connect error or timeout means
//! blocked. Results are cached so a transfer does not re-probe per chunk.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tokio::sync::Notify;

use crate::engines::CancelToken;

pub const TELEGRAM_ORIGIN: &str = "https://api.telegram.org";
const PROBE_TIMEOUT: Duration = Duration::from_secs(6);
const CACHE_TTL: Duration = Duration::from_secs(600);

/// Probe cache + wake signal. The process uses one global instance; tests make
/// their own so they cannot disturb each other.
#[derive(Default)]
pub struct Reach {
    cache: Mutex<HashMap<String, (bool, Instant)>>,
    generation: AtomicU64,
    notify: Notify,
}

impl Reach {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cached probe: at most one request per origin per ten minutes.
    pub async fn reachable(&self, origin: &str) -> bool {
        if let Some((ok, at)) = self.cache.lock().unwrap().get(origin).copied() {
            if at.elapsed() < CACHE_TTL {
                return ok;
            }
        }
        let ok = probe(origin).await;
        self.cache
            .lock()
            .unwrap()
            .insert(origin.to_string(), (ok, Instant::now()));
        ok
    }

    pub fn forget(&self, origin: &str) {
        self.cache.lock().unwrap().remove(origin);
    }

    /// Record a failure seen by a real transfer, so the next decision does not
    /// trust an older "reachable" answer.
    pub fn mark_blocked(&self, origin: &str) {
        self.cache
            .lock()
            .unwrap()
            .insert(origin.to_string(), (false, Instant::now()));
    }

    /// Clears the cache and wakes every waiter to re-check at once.
    pub fn retry_now(&self) {
        self.cache.lock().unwrap().clear();
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    /// Snapshot to pass to [`Reach::sleep_or_wake`]; a `retry_now` after it
    /// makes that sleep return at once even if it began later.
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    /// Sleeps up to `dur`; returns early on `retry_now` or cancel.
    pub async fn sleep_or_wake(&self, dur: Duration, since: u64, cancel: &CancelToken) {
        let notified = self.notify.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if self.generation() != since || cancel.is_cancelled() {
            return;
        }
        tokio::select! {
            _ = tokio::time::sleep(dur) => {}
            _ = notified => {}
            _ = cancel.cancelled() => {}
        }
    }
}

async fn probe(origin: &str) -> bool {
    let Ok(http) = reqwest::Client::builder()
        .connect_timeout(PROBE_TIMEOUT)
        .timeout(PROBE_TIMEOUT)
        .build()
    else {
        return false;
    };
    http.get(origin).send().await.is_ok()
}

fn global() -> &'static Reach {
    static G: OnceLock<Reach> = OnceLock::new();
    G.get_or_init(Reach::new)
}

pub fn shared() -> &'static Reach {
    global()
}

pub async fn reachable(origin: &str) -> bool {
    global().reachable(origin).await
}

pub fn forget(origin: &str) {
    global().forget(origin)
}

/// Wakes every waiting transfer to re-probe immediately (the "Try again" button).
pub fn retry_now() {
    global().retry_now()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{serve, Reply};
    use std::sync::atomic::Ordering::SeqCst;

    #[tokio::test]
    async fn any_http_answer_is_reachable_even_an_error_status() {
        let (base, _) = serve(|_, _| Reply::status(404, "no")).await;
        assert!(Reach::new().reachable(&base).await);
    }

    #[tokio::test]
    async fn a_closed_port_is_blocked() {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        drop(l);
        assert!(!Reach::new().reachable(&format!("http://{addr}")).await);
    }

    #[tokio::test]
    async fn the_result_is_cached_until_forgotten() {
        let (base, hits) = serve(|_, _| Reply::status(200, "ok")).await;
        let r = Reach::new();
        assert!(r.reachable(&base).await);
        assert!(r.reachable(&base).await);
        assert_eq!(hits.load(SeqCst), 1);
        r.forget(&base);
        assert!(r.reachable(&base).await);
        assert_eq!(hits.load(SeqCst), 2);
    }

    #[tokio::test]
    async fn retry_now_clears_the_cache() {
        let (base, hits) = serve(|_, _| Reply::status(200, "ok")).await;
        let r = Reach::new();
        r.reachable(&base).await;
        r.retry_now();
        r.reachable(&base).await;
        assert_eq!(hits.load(SeqCst), 2);
    }

    #[tokio::test]
    async fn a_marked_origin_reads_blocked_without_a_request() {
        let (base, hits) = serve(|_, _| Reply::status(200, "ok")).await;
        let r = Reach::new();
        r.mark_blocked(&base);
        assert!(!r.reachable(&base).await);
        assert_eq!(hits.load(SeqCst), 0);
    }

    #[tokio::test]
    async fn retry_now_cuts_a_sleep_short_and_so_does_cancel() {
        let r = std::sync::Arc::new(Reach::new());
        let cancel = CancelToken::new();
        let g = r.generation();
        let r2 = r.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            r2.retry_now();
        });
        let t = Instant::now();
        r.sleep_or_wake(Duration::from_secs(30), g, &cancel).await;
        assert!(t.elapsed() < Duration::from_secs(2));

        let g = r.generation();
        let c2 = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            c2.cancel();
        });
        let t = Instant::now();
        r.sleep_or_wake(Duration::from_secs(30), g, &cancel).await;
        assert!(t.elapsed() < Duration::from_secs(2));
    }

    #[tokio::test]
    async fn a_retry_that_landed_before_the_sleep_is_not_lost() {
        let r = Reach::new();
        let g = r.generation();
        r.retry_now();
        let t = Instant::now();
        r.sleep_or_wake(Duration::from_secs(30), g, &CancelToken::new())
            .await;
        assert!(t.elapsed() < Duration::from_secs(1));
    }
}
