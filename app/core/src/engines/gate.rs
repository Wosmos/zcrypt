//! The transfer-allowance gate. Every app tries the user's own platform
//! directly. When Telegram is unreachable it goes through the server relay only
//! if the rest of the transfer fits the allowance; otherwise the transfer waits
//! (re-checking every few seconds, or at once on `retry_now`) and continues
//! direct. The server enforces the allowance; this only decides what to try.

use std::sync::atomic::AtomicI64;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

use super::{CancelToken, EngineContext, EngineError};
use crate::reach::{self, Reach, TELEGRAM_ORIGIN};
use crate::types::{Platform, Progress, Stage, UploadMode};

pub(crate) const WAIT_TELEGRAM_BLOCKED: &str = "telegram_blocked";
pub(crate) const WAIT_ALLOWANCE_USED_UP: &str = "allowance_used_up";
const POLL: Duration = Duration::from_secs(10);

/// What the gate asks about the outside world; tests inject their own.
#[async_trait]
pub(crate) trait Env: Send + Sync {
    /// Cached reachability.
    async fn reachable(&self, origin: &str) -> bool;
    /// Forgets the cache, then probes.
    async fn probe_fresh(&self, origin: &str) -> bool;
    fn mark_blocked(&self, origin: &str);
    /// Whether `bytes` fit the relay allowance. Fails closed.
    async fn fits(&self, bytes: i64, file_size: i64) -> bool;
    fn reach(&self) -> &Reach;
    fn poll(&self) -> Duration {
        POLL
    }
}

struct LiveEnv(Arc<crate::api::Client>);

#[async_trait]
impl Env for LiveEnv {
    async fn reachable(&self, origin: &str) -> bool {
        reach::reachable(origin).await
    }
    async fn probe_fresh(&self, origin: &str) -> bool {
        reach::forget(origin);
        reach::reachable(origin).await
    }
    fn mark_blocked(&self, origin: &str) {
        reach::shared().mark_blocked(origin)
    }
    async fn fits(&self, bytes: i64, file_size: i64) -> bool {
        match self.0.get_quota().await {
            Ok(q) => q.fits(bytes, file_size),
            Err(_) => false,
        }
    }
    fn reach(&self) -> &Reach {
        reach::shared()
    }
}

pub(crate) type Notify = Arc<dyn Fn(&'static str) + Send + Sync>;

#[derive(Clone)]
pub(crate) struct Gate {
    pub env: Arc<dyn Env>,
    pub cancel: CancelToken,
    /// Foreground transfers wait and report through this; `None` (background
    /// passes, previews) returns [`EngineError::Blocked`] instead of waiting.
    pub notify: Option<Notify>,
    /// Bytes of the transfer still to move, for the "does the rest fit" check.
    pub remaining: Arc<AtomicI64>,
}

impl Gate {
    pub(crate) fn live(ctx: &EngineContext, notify: Option<Notify>, remaining: i64) -> Self {
        Self {
            env: Arc::new(LiveEnv(ctx.client.clone())),
            cancel: ctx.cancel.clone(),
            notify,
            remaining: Arc::new(AtomicI64::new(remaining)),
        }
    }

    /// A notifier that emits a `Stage::Waiting` progress event.
    pub(crate) fn waiting_progress(
        ctx: &EngineContext,
        file_id: String,
        file_name: String,
        bytes_total: i64,
    ) -> Notify {
        let progress = ctx.progress.clone();
        Arc::new(move |reason| {
            progress(Progress {
                file_id: file_id.clone(),
                file_name: file_name.clone(),
                stage: Stage::Waiting,
                chunks_done: 0,
                chunks_total: 0,
                bytes_done: 0,
                bytes_total,
                speed: 0.0,
                waiting: Some(reason.to_string()),
            })
        })
    }

    /// Waits until `origin` answers, re-probing every poll interval or at once
    /// on `retry_now`. Cancel returns `Cancelled` promptly.
    pub(crate) async fn wait_reachable(
        &self,
        reason: &'static str,
        origin: &str,
    ) -> Result<(), EngineError> {
        let Some(notify) = &self.notify else {
            return Err(EngineError::Blocked(reason.into()));
        };
        loop {
            if self.cancel.is_cancelled() {
                return Err(EngineError::Cancelled);
            }
            notify(reason);
            let gen = self.env.reach().generation();
            self.env
                .reach()
                .sleep_or_wake(self.env.poll(), gen, &self.cancel)
                .await;
            if self.cancel.is_cancelled() {
                return Err(EngineError::Cancelled);
            }
            if self.env.probe_fresh(origin).await {
                return Ok(());
            }
        }
    }

    /// Plane for a new upload. A Telegram token means direct while Telegram
    /// answers; if it does not, relay when the whole file fits the allowance,
    /// else wait for Telegram.
    pub(crate) async fn pick_plane(
        &self,
        creds: &super::CredProvider,
        file_size: i64,
    ) -> Result<(UploadMode, Option<Platform>), EngineError> {
        let (mode, plat) = super::choose_plane(creds);
        if plat != Some(Platform::Telegram) || self.env.reachable(TELEGRAM_ORIGIN).await {
            return Ok((mode, plat));
        }
        if self.env.fits(file_size, file_size).await {
            return Ok((UploadMode::Relay, None));
        }
        self.wait_reachable(WAIT_TELEGRAM_BLOCKED, TELEGRAM_ORIGIN)
            .await?;
        Ok((mode, plat))
    }
}

/// The platform's probe origin; only Telegram is gated.
pub(crate) fn origin_for(platform: &str) -> Option<&'static str> {
    (platform == Platform::Telegram.as_str()).then_some(TELEGRAM_ORIGIN)
}

/// The server refused a relay request because of the transfer allowance.
pub(crate) fn is_allowance_refusal(e: &EngineError) -> bool {
    let EngineError::Api(crate::api::ApiError::Status { status, body }) = e else {
        return false;
    };
    if !matches!(status, 403 | 413) {
        return false;
    }
    let code = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("code").and_then(|c| c.as_str().map(String::from)));
    matches!(
        code.as_deref(),
        Some("relay_daily_exceeded" | "relay_allowance_exceeded" | "relay_file_too_large")
    )
}

/// A direct transfer failed because the platform could not even be connected to.
pub(crate) fn is_direct_unreachable(e: &EngineError) -> bool {
    matches!(
        e,
        EngineError::Adapter(crate::adapters::AdapterError::Http(h)) if h.is_connect()
    )
}

#[cfg(test)]
pub(crate) mod fake {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    pub(crate) struct FakeEnv {
        pub reachable: AtomicBool,
        pub fits: AtomicBool,
        pub reach: Reach,
        pub probes: AtomicUsize,
    }

    impl FakeEnv {
        pub(crate) fn new(reachable: bool, fits: bool) -> Arc<Self> {
            Arc::new(Self {
                reachable: AtomicBool::new(reachable),
                fits: AtomicBool::new(fits),
                reach: Reach::new(),
                probes: AtomicUsize::new(0),
            })
        }
    }

    #[async_trait]
    impl Env for FakeEnv {
        async fn reachable(&self, _: &str) -> bool {
            self.reachable.load(Ordering::SeqCst)
        }
        async fn probe_fresh(&self, _: &str) -> bool {
            self.probes.fetch_add(1, Ordering::SeqCst);
            self.reachable.load(Ordering::SeqCst)
        }
        fn mark_blocked(&self, _: &str) {
            self.reachable.store(false, Ordering::SeqCst);
        }
        async fn fits(&self, _: i64, _: i64) -> bool {
            self.fits.load(Ordering::SeqCst)
        }
        fn reach(&self) -> &Reach {
            &self.reach
        }
        fn poll(&self) -> Duration {
            Duration::from_millis(20)
        }
    }

    pub(crate) fn gate(env: Arc<FakeEnv>, notify: Option<Notify>) -> Gate {
        Gate {
            env,
            cancel: CancelToken::new(),
            notify,
            remaining: Arc::new(AtomicI64::new(0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fake::*;
    use super::*;
    use std::sync::atomic::Ordering;
    use std::sync::Mutex;
    use std::time::Instant;

    fn tg_creds() -> super::super::CredProvider {
        Arc::new(|p| {
            (p == "telegram").then(|| super::super::PlatformCreds {
                token: "t".into(),
                account: "a".into(),
            })
        })
    }

    fn recorder() -> (Notify, Arc<Mutex<Vec<&'static str>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let s = seen.clone();
        (Arc::new(move |r| s.lock().unwrap().push(r)), seen)
    }

    #[tokio::test]
    async fn reachable_telegram_goes_direct() {
        let g = gate(FakeEnv::new(true, true), None);
        let (mode, plat) = g.pick_plane(&tg_creds(), 100).await.unwrap();
        assert_eq!(
            (mode, plat),
            (UploadMode::ByosDirect, Some(Platform::Telegram))
        );
    }

    #[tokio::test]
    async fn blocked_telegram_relays_only_when_the_file_fits() {
        let g = gate(FakeEnv::new(false, true), None);
        let (mode, plat) = g.pick_plane(&tg_creds(), 100).await.unwrap();
        assert_eq!((mode, plat), (UploadMode::Relay, None));
    }

    #[tokio::test]
    async fn blocked_and_not_fitting_waits_then_goes_direct_when_telegram_returns() {
        let env = FakeEnv::new(false, false);
        let (notify, seen) = recorder();
        let g = gate(env.clone(), Some(notify));
        let e2 = env.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            e2.reachable.store(true, Ordering::SeqCst);
        });
        let (mode, plat) = g.pick_plane(&tg_creds(), 100).await.unwrap();
        assert_eq!(
            (mode, plat),
            (UploadMode::ByosDirect, Some(Platform::Telegram))
        );
        let seen = seen.lock().unwrap();
        assert!(!seen.is_empty() && seen.iter().all(|r| *r == WAIT_TELEGRAM_BLOCKED));
        assert!(env.probes.load(Ordering::SeqCst) >= 1);
    }

    #[tokio::test]
    async fn a_background_gate_reports_blocked_instead_of_waiting() {
        let g = gate(FakeEnv::new(false, false), None);
        let r = g.pick_plane(&tg_creds(), 100).await;
        assert!(matches!(r, Err(EngineError::Blocked(m)) if m == WAIT_TELEGRAM_BLOCKED));
    }

    #[tokio::test]
    async fn the_wait_exits_promptly_on_cancel() {
        let (notify, _) = recorder();
        let g = gate(FakeEnv::new(false, false), Some(notify));
        let c = g.cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(60)).await;
            c.cancel();
        });
        let t = Instant::now();
        let r = g.wait_reachable(WAIT_TELEGRAM_BLOCKED, "x").await;
        assert!(matches!(r, Err(EngineError::Cancelled)));
        assert!(t.elapsed() < Duration::from_secs(1));
    }

    #[tokio::test]
    async fn retry_now_makes_the_wait_probe_at_once() {
        struct Slow(Arc<FakeEnv>);
        #[async_trait]
        impl Env for Slow {
            async fn reachable(&self, o: &str) -> bool {
                self.0.reachable(o).await
            }
            async fn probe_fresh(&self, o: &str) -> bool {
                self.0.probe_fresh(o).await
            }
            fn mark_blocked(&self, o: &str) {
                self.0.mark_blocked(o)
            }
            async fn fits(&self, a: i64, b: i64) -> bool {
                self.0.fits(a, b).await
            }
            fn reach(&self) -> &Reach {
                self.0.reach()
            }
            fn poll(&self) -> Duration {
                Duration::from_secs(60)
            }
        }
        let env = FakeEnv::new(false, false);
        let (notify, _) = recorder();
        let mut g = gate(env.clone(), Some(notify));
        g.env = Arc::new(Slow(env.clone()));
        let e2 = env.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(60)).await;
            e2.reachable.store(true, Ordering::SeqCst);
            e2.reach.retry_now();
        });
        let t = Instant::now();
        g.wait_reachable(WAIT_ALLOWANCE_USED_UP, "x").await.unwrap();
        assert!(t.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn allowance_codes_are_told_from_other_refusals() {
        let api = |status, code: &str| {
            EngineError::Api(crate::api::ApiError::Status {
                status,
                body: format!(r#"{{"error":"x","code":"{code}"}}"#),
            })
        };
        assert!(is_allowance_refusal(&api(403, "relay_daily_exceeded")));
        assert!(is_allowance_refusal(&api(403, "relay_allowance_exceeded")));
        assert!(is_allowance_refusal(&api(413, "relay_file_too_large")));
        assert!(!is_allowance_refusal(&api(403, "forbidden")));
        assert!(!is_allowance_refusal(&EngineError::Other("x".into())));
    }
}
