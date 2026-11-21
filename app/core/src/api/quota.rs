//! Transfer allowance (`GET /api/quota`): the bytes that may still pass
//! through the server relay today and this month.

use serde::Deserialize;

use super::client::{ApiError, Client};

/// Relay allowance fields of `/api/quota`. A limit of 0 means no cap.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Quota {
    #[serde(default)]
    pub relay_used_bytes: i64,
    #[serde(default)]
    pub relay_limit_bytes: i64,
    #[serde(default)]
    pub relay_day_used_bytes: i64,
    #[serde(default)]
    pub relay_day_limit_bytes: i64,
    #[serde(default)]
    pub relay_reserved_bytes: i64,
    #[serde(default)]
    pub relay_max_file_bytes: i64,
    /// When the month's window starts over (RFC 3339).
    #[serde(default)]
    pub relay_resets_at: String,
    /// When the day's window starts over (RFC 3339).
    #[serde(default)]
    pub relay_day_resets_at: String,
}

/// What the server would answer to a transfer that doesn't fit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub code: &'static str,
    pub limit_bytes: i64,
    pub used_bytes: i64,
    pub resets_at: String,
}

fn left(limit: i64, used: i64, reserved: i64) -> i64 {
    if limit <= 0 {
        i64::MAX
    } else {
        (limit - used - reserved).max(0)
    }
}

impl Quota {
    /// Bytes the relay will still take: the smaller of the day and month
    /// windows, `i64::MAX` when both are uncapped.
    pub fn remaining(&self) -> i64 {
        left(
            self.relay_day_limit_bytes,
            self.relay_day_used_bytes,
            self.relay_reserved_bytes,
        )
        .min(left(
            self.relay_limit_bytes,
            self.relay_used_bytes,
            self.relay_reserved_bytes,
        ))
    }

    /// Whether `bytes` more can go through the relay. `file_size` is checked
    /// against the per-file cap (pass 0 for downloads, which have none).
    pub fn fits(&self, bytes: i64, file_size: i64) -> bool {
        if self.relay_max_file_bytes > 0 && file_size > self.relay_max_file_bytes {
            return false;
        }
        bytes <= self.remaining()
    }
}

impl Quota {
    /// The server's refusal for `need` more relayed bytes, or `None` when they
    /// fit. The daily window is named when it is the one that runs out, like
    /// the server does.
    pub fn refusal(&self, need: i64) -> Option<Refusal> {
        let day = left(
            self.relay_day_limit_bytes,
            self.relay_day_used_bytes,
            self.relay_reserved_bytes,
        );
        let month = left(
            self.relay_limit_bytes,
            self.relay_used_bytes,
            self.relay_reserved_bytes,
        );
        if need <= day.min(month) {
            return None;
        }
        Some(if need > day {
            Refusal {
                code: "relay_daily_exceeded",
                limit_bytes: self.relay_day_limit_bytes,
                used_bytes: self.relay_day_used_bytes + self.relay_reserved_bytes,
                resets_at: self.relay_day_resets_at.clone(),
            }
        } else {
            Refusal {
                code: "relay_allowance_exceeded",
                limit_bytes: self.relay_limit_bytes,
                used_bytes: self.relay_used_bytes + self.relay_reserved_bytes,
                resets_at: self.relay_resets_at.clone(),
            }
        })
    }
}

impl Client {
    pub async fn get_quota(&self) -> Result<Quota, ApiError> {
        self.send_json(|http, base| http.get(format!("{base}/api/quota")))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q() -> Quota {
        Quota {
            relay_limit_bytes: 1000,
            relay_used_bytes: 100,
            relay_day_limit_bytes: 300,
            relay_day_used_bytes: 100,
            relay_reserved_bytes: 50,
            relay_max_file_bytes: 0,
            relay_resets_at: "2026-12-01T00:00:00Z".into(),
            relay_day_resets_at: "2026-11-23T00:00:00Z".into(),
        }
    }

    #[test]
    fn the_refusal_names_the_window_that_runs_out_like_the_server() {
        assert_eq!(q().refusal(150), None);
        let day = q().refusal(151).unwrap();
        assert_eq!(
            (
                day.code,
                day.limit_bytes,
                day.used_bytes,
                day.resets_at.as_str()
            ),
            ("relay_daily_exceeded", 300, 150, "2026-11-23T00:00:00Z")
        );
        let mut x = q();
        x.relay_day_limit_bytes = 0;
        let month = x.refusal(851).unwrap();
        assert_eq!(
            (
                month.code,
                month.limit_bytes,
                month.used_bytes,
                month.resets_at.as_str()
            ),
            (
                "relay_allowance_exceeded",
                1000,
                150,
                "2026-12-01T00:00:00Z"
            )
        );
        x.relay_limit_bytes = 0;
        assert_eq!(x.refusal(i64::MAX), None, "admins have no limits");
    }

    #[test]
    fn the_tighter_window_wins_and_reserved_bytes_count() {
        assert_eq!(q().remaining(), 150);
        assert!(q().fits(150, 150));
        assert!(!q().fits(151, 151));
    }

    #[test]
    fn zero_means_unlimited_per_window() {
        let mut x = q();
        x.relay_day_limit_bytes = 0;
        assert_eq!(x.remaining(), 850);
        x.relay_limit_bytes = 0;
        assert_eq!(x.remaining(), i64::MAX);
    }

    #[test]
    fn a_file_over_the_per_file_cap_never_fits() {
        let mut x = q();
        x.relay_max_file_bytes = 100;
        assert!(!x.fits(101, 101));
        assert!(x.fits(100, 100));
        assert!(x.fits(120, 0), "downloads have no per-file cap");
    }

    #[test]
    fn an_overdrawn_window_leaves_nothing() {
        let mut x = q();
        x.relay_day_used_bytes = 900;
        assert_eq!(x.remaining(), 0);
    }
}
