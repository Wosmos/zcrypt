//! On-disk cache of ENCRYPTED chunk bytes, keyed by the chunk's ciphertext
//! SHA-256. Ciphertext only, so nothing here weakens zero-knowledge, and a hit
//! is re-verified against its key before use. Chunks are immutable, so an
//! entry never goes stale; a size-capped mtime LRU keeps the directory bounded.
//! Every operation is best-effort: a cache failure never fails a download.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::crypto;

const BUDGET_BYTES: u64 = 1024 * 1024 * 1024;

fn default_dir() -> Option<PathBuf> {
    Some(dirs::cache_dir()?.join("zcrypt-desktop").join("chunks"))
}

fn valid_key(sha: &str) -> bool {
    sha.len() == 64 && sha.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Cached ciphertext for `sha`, or None on a miss / unknown sha / bad entry.
pub(super) async fn get(sha: &str) -> Option<Vec<u8>> {
    let dir = default_dir()?;
    let sha = sha.to_string();
    tokio::task::spawn_blocking(move || get_in(&dir, &sha))
        .await
        .ok()
        .flatten()
}

/// Store ciphertext under its sha in the background (fire-and-forget).
pub(super) fn put(sha: &str, data: &[u8]) {
    let Some(dir) = default_dir() else { return };
    if !valid_key(sha) {
        return;
    }
    let sha = sha.to_string();
    let data = data.to_vec();
    tokio::task::spawn_blocking(move || put_in(&dir, &sha, &data, BUDGET_BYTES));
}

fn get_in(dir: &Path, sha: &str) -> Option<Vec<u8>> {
    if !valid_key(sha) {
        return None;
    }
    let path = dir.join(sha);
    let data = std::fs::read(&path).ok()?;
    if crypto::sha256_hex(&data) != sha.to_ascii_lowercase() {
        let _ = std::fs::remove_file(&path);
        return None;
    }
    if let Ok(f) = std::fs::File::options().write(true).open(&path) {
        let _ = f.set_modified(SystemTime::now());
    }
    Some(data)
}

fn put_in(dir: &Path, sha: &str, data: &[u8], budget: u64) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let tmp = dir.join(format!("{sha}.{}.tmp", uuid::Uuid::new_v4()));
    if std::fs::write(&tmp, data).is_err() || std::fs::rename(&tmp, dir.join(sha)).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return;
    }
    sweep(dir, budget);
}

fn sweep(dir: &Path, budget: u64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, u64, SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            m.is_file().then(|| {
                (
                    e.path(),
                    m.len(),
                    m.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                )
            })
        })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    if total <= budget {
        return;
    }
    files.sort_by_key(|f| f.2);
    for (path, size, _) in files {
        if total <= budget {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("zcrypt-chunk-cache-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn round_trip_and_rejects_bad_keys() {
        let dir = temp_dir();
        let data = b"ciphertext bytes".to_vec();
        let sha = crypto::sha256_hex(&data);
        assert!(get_in(&dir, &sha).is_none());
        put_in(&dir, &sha, &data, BUDGET_BYTES);
        assert_eq!(get_in(&dir, &sha), Some(data));
        assert!(get_in(&dir, "../etc/passwd").is_none());
        assert!(!valid_key("zz"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_entry_is_dropped() {
        let dir = temp_dir();
        let sha = crypto::sha256_hex(b"real");
        put_in(&dir, &sha, b"not the real bytes", BUDGET_BYTES);
        assert!(get_in(&dir, &sha).is_none());
        assert!(!dir.join(&sha).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sweep_evicts_oldest_over_budget() {
        let dir = temp_dir();
        let a = vec![1u8; 100];
        let b = vec![2u8; 100];
        let (sa, sb) = (crypto::sha256_hex(&a), crypto::sha256_hex(&b));
        put_in(&dir, &sa, &a, 1000);
        let old = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1);
        std::fs::File::options()
            .write(true)
            .open(dir.join(&sa))
            .unwrap()
            .set_modified(old)
            .unwrap();
        put_in(&dir, &sb, &b, 150);
        assert!(!dir.join(&sa).exists());
        assert!(dir.join(&sb).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
