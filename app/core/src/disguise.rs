//! Disguised repo/file naming — ported from `app/backend/disguise` so
//! client-created repos and chunk paths are indistinguishable from the
//! server-created ones.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;

const ADJECTIVES: &[&str] = &[
    "utils", "config", "build", "core", "base", "common", "shared", "internal", "simple", "fast",
    "tiny", "mini", "micro", "basic", "clean", "safe", "smart", "auto", "quick", "lean",
];

const NOUNS: &[&str] = &[
    "tools", "helpers", "cache", "loader", "parser", "runner", "worker", "bridge", "engine",
    "manager", "handler", "service", "module", "plugin", "adapter", "wrapper", "logger", "client",
    "proxy", "store",
];

const COMMIT_MESSAGES: &[&str] = &[
    "chore: update cache artifacts",
    "refactor: optimize build output",
    "fix: update stale references",
    "chore: rebuild generated assets",
    "fix: correct module paths",
    "chore: sync dependency cache",
    "refactor: clean up build scripts",
    "chore: update artifact checksums",
    "fix: resolve path conflicts",
    "chore: regenerate output files",
    "refactor: simplify module structure",
    "chore: bump artifact version",
    "fix: patch output encoding",
    "chore: refresh build cache",
    "refactor: normalize file structure",
];

fn pick<'a>(list: &'a [&'a str]) -> &'a str {
    list[(OsRng.next_u32() as usize) % list.len()]
}

fn random_hex8() -> String {
    let mut b = [0u8; 8];
    OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

/// Plausible-looking dev project name, e.g. `simple-helpers-v1`.
pub fn repo_name(index: usize) -> String {
    format!("{}-{}-v{}", pick(ADJECTIVES), pick(NOUNS), index)
}

/// Flat random chunk filename, e.g. `8e3168bae666969f.bin` (Telegram).
pub fn chunk_filename() -> String {
    format!("{}.bin", random_hex8())
}

/// Sharded chunk path, e.g. `ab/cdef1234567890.bin` (git platforms — keeps any
/// single folder well under HuggingFace's 10k entries-per-folder limit).
pub fn sharded_chunk_filename() -> String {
    let name = random_hex8();
    format!("{}/{}.bin", &name[..2], &name[2..])
}

/// Random conventional-commit-style message.
pub fn commit_message() -> &'static str {
    pick(COMMIT_MESSAGES)
}

/// Generic developer-project README used when creating repos.
pub fn readme_content(repo_name: &str) -> String {
    format!(
        "# {repo_name}\n\nInternal build artifacts and cache storage.\n\nThis repository is auto-managed. Do not edit files manually.\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shapes() {
        let r = repo_name(3);
        assert!(r.ends_with("-v3"));
        assert_eq!(chunk_filename().len(), 16 + 4);
        let s = sharded_chunk_filename();
        assert_eq!(&s[2..3], "/");
        assert!(s.ends_with(".bin"));
        assert!(readme_content("x").starts_with("# x\n"));
        assert!(!commit_message().is_empty());
    }
}
