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
        }
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
