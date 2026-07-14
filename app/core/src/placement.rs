//! Multi-platform placement policy — decides WHICH of the user's connected
//! platforms receives a file (whole file: chunks never split across platforms,
//! preserving the resume/download model).
//!
//! rclone-union-style create policy, constraint-aware: filter ineligible
//! platforms (capacity, rate budget, health), score the survivors, pick the
//! best. Telegram is weighted highest for large/bulk work — it is the only
//! backend with unlimited capacity and no commit-rate wall; HuggingFace is the
//! scarcest (100 GB/account + ~128 commits/hr) and scores lowest.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementMode {
    /// Weighted scoring (default): Telegram-primary, git spillover.
    Smart,
    /// Most free capacity wins (rclone `mfs`).
    MostFree,
    /// Round-robin across eligible platforms (rclone `eprand`-ish).
    Spread,
}

/// Live view of one connected platform, provided by the caller (sync worker
/// keeps these updated from repo usage + recent write counts).
#[derive(Debug, Clone)]
pub struct PlatformState {
    pub platform: String,
    /// Remaining capacity in bytes; `None` = unlimited (Telegram).
    pub free_bytes: Option<i64>,
    /// Writes still allowed in the current rate window (commits/messages).
    pub rate_budget: u32,
    /// Recent hard failures mark a platform unhealthy until it recovers.
    pub healthy: bool,
}

/// Base preference under `Smart` — capacity-unlimited and rate-generous first.
fn base_weight(platform: &str) -> f64 {
    match platform {
        "telegram" => 1.0,
        "github" => 0.6,
        "gitlab" => 0.5,
        "huggingface" => 0.25,
        _ => 0.1,
    }
}

/// Pick a platform for a file of `file_size` bytes needing `chunk_count`
/// writes. Returns `None` when nothing is eligible (caller falls back to the
/// server relay / retries later).
pub fn pick_platform(
    mode: PlacementMode,
    states: &[PlatformState],
    file_size: i64,
    chunk_count: u32,
    round_robin_cursor: usize,
) -> Option<String> {
    let eligible: Vec<&PlatformState> = states
        .iter()
        .filter(|s| s.healthy)
        .filter(|s| s.free_bytes.is_none_or(|free| free >= file_size))
        .filter(|s| s.rate_budget >= chunk_count)
        .collect();

    if eligible.is_empty() {
        return None;
    }

    let chosen = match mode {
        PlacementMode::Spread => eligible[round_robin_cursor % eligible.len()],
        PlacementMode::MostFree => eligible
            .iter()
            .max_by_key(|s| s.free_bytes.unwrap_or(i64::MAX))
            .copied()?,
        PlacementMode::Smart => eligible
            .iter()
            .max_by(|a, b| smart_score(a, file_size).total_cmp(&smart_score(b, file_size)))
            .copied()?,
    };
    Some(chosen.platform.clone())
}

fn smart_score(s: &PlatformState, file_size: i64) -> f64 {
    let mut score = base_weight(&s.platform);
    // Capacity pressure: penalize platforms the file would materially fill.
    if let Some(free) = s.free_bytes {
        let after = (free - file_size).max(0) as f64 / free.max(1) as f64;
        score *= 0.25 + 0.75 * after;
    }
    // Rate pressure: penalize nearly-exhausted write budgets.
    score *= (s.rate_budget.min(200) as f64) / 200.0;
    // Large files gravitate harder toward unlimited storage.
    if file_size > 512 * 1024 * 1024 && s.free_bytes.is_none() {
        score *= 1.5;
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(p: &str, free: Option<i64>, rate: u32) -> PlatformState {
        PlatformState {
            platform: p.into(),
            free_bytes: free,
            rate_budget: rate,
            healthy: true,
        }
    }

    const GB: i64 = 1024 * 1024 * 1024;

    #[test]
    fn smart_prefers_telegram_for_big_files() {
        let states = vec![
            state("github", Some(GB), 100),
            state("telegram", None, 1000),
            state("huggingface", Some(50 * GB), 100),
        ];
        let pick = pick_platform(PlacementMode::Smart, &states, 2 * GB, 200, 0);
        assert_eq!(pick.as_deref(), Some("telegram"));
    }

    #[test]
    fn capacity_filter_excludes_full_platforms() {
        let states = vec![
            state("github", Some(10), 100),
            state("gitlab", Some(GB), 100),
        ];
        let pick = pick_platform(PlacementMode::Smart, &states, 1024, 1, 0);
        assert_eq!(pick.as_deref(), Some("gitlab"));
    }

    #[test]
    fn rate_budget_filter_excludes_exhausted() {
        let states = vec![
            state("huggingface", Some(GB), 2),
            state("github", Some(GB), 500),
        ];
        let pick = pick_platform(PlacementMode::Smart, &states, 1024, 50, 0);
        assert_eq!(pick.as_deref(), Some("github"));
    }

    #[test]
    fn nothing_eligible_returns_none() {
        let states = vec![state("github", Some(0), 0)];
        assert!(pick_platform(PlacementMode::Smart, &states, 1024, 1, 0).is_none());
    }

    #[test]
    fn spread_round_robins() {
        let states = vec![
            state("github", Some(GB), 100),
            state("gitlab", Some(GB), 100),
        ];
        let a = pick_platform(PlacementMode::Spread, &states, 1, 1, 0).unwrap();
        let b = pick_platform(PlacementMode::Spread, &states, 1, 1, 1).unwrap();
        assert_ne!(a, b);
    }
}
