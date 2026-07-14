//! Device performance profiles — ported verbatim from
//! `sidecar/pipeline/profile.go` (which mirrors the web `device-profile` tiers).

/// Tuning knobs for the pipeline engines.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Profile {
    pub name: &'static str,
    /// Parallel crypto workers (0 = number of logical CPUs, resolved at use).
    pub workers: usize,
    pub chunk_size: usize,
    pub zstd_level: i32,
    pub concurrent_uploads: usize,
    pub concurrent_downloads: usize,
}

const MIB: usize = 1024 * 1024;

pub const LIGHT: Profile = Profile {
    name: "light",
    workers: 2,
    chunk_size: 4 * MIB,
    zstd_level: 1,
    concurrent_uploads: 1,
    concurrent_downloads: 2,
};

pub const NORMAL: Profile = Profile {
    name: "normal",
    workers: 4,
    chunk_size: 10 * MIB,
    zstd_level: 2,
    concurrent_uploads: 2,
    concurrent_downloads: 3,
};

pub const INTENSE: Profile = Profile {
    name: "intense",
    workers: 8,
    chunk_size: 16 * MIB,
    zstd_level: 3,
    concurrent_uploads: 4,
    concurrent_downloads: 4,
};

pub const LUDICROUS: Profile = Profile {
    name: "ludicrous",
    workers: 0, // all cores
    chunk_size: 32 * MIB,
    zstd_level: 3,
    concurrent_uploads: 8,
    concurrent_downloads: 8,
};

/// Look up a profile by name; unknown names fall back to `normal`, matching the
/// sidecar's `GetProfile`.
pub fn get_profile(name: &str) -> Profile {
    match name {
        "light" => LIGHT,
        "intense" => INTENSE,
        "ludicrous" => LUDICROUS,
        _ => NORMAL,
    }
}

impl Profile {
    /// Resolve `workers == 0` (ludicrous) to the actual core count.
    pub fn effective_workers(&self) -> usize {
        if self.workers == 0 {
            std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4)
        } else {
            self.workers
        }
    }
}
