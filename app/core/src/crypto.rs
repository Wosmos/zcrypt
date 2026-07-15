//! Zero-knowledge crypto primitives.
//!
//! NORMATIVE: byte-compatible with docs/CRYPTO_FORMAT.md and enforced by the
//! shared vectors (`tests/conformance.rs`). Mirrors the web client
//! (`app/frontend/lib/crypto.ts`) and the Go sidecar
//! (`app/desktop/sidecar/crypto`).
//!
//! Wire format for every AES-GCM output (chunks, wrapped CEKs, names):
//! `[12-byte IV || ciphertext || 16-byte GCM tag]`, no AAD.

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, OnceLock};

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub const SALT_SIZE: usize = 32;
pub const KEY_SIZE: usize = 32;
pub const IV_SIZE: usize = 12;
pub const TAG_SIZE: usize = 16;
pub const PBKDF2_ITERATIONS: u32 = 600_000;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("ciphertext too short: {0} bytes")]
    TooShort(usize),
    #[error("invalid key length: {0} bytes")]
    BadKey(usize),
    /// AES-GCM authentication failed — wrong key/passphrase or tampered data.
    #[error("decryption failed — wrong passphrase or corrupt data")]
    AuthFailed,
}

/// PBKDF2-HMAC-SHA256, 600k iterations, 32-byte key. The salt is raw bytes —
/// callers pass either a random 32-byte salt (file KEK) or a UTF-8 text salt
/// (`zcrypt-names-<uid>` / `zcrypt-dedup-<uid>` sub-keys).
pub fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; KEY_SIZE] {
    let mut key = [0u8; KEY_SIZE];
    pbkdf2::pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

/// Per-user name key: encrypts file/folder names and style blobs.
pub fn derive_name_key(passphrase: &str, user_id: &str) -> [u8; KEY_SIZE] {
    derive_key(passphrase, format!("zcrypt-names-{user_id}").as_bytes())
}

/// Per-user dedup/MAC key: keys the `hmac_v1` content MAC.
pub fn derive_dedup_key(passphrase: &str, user_id: &str) -> [u8; KEY_SIZE] {
    derive_key(passphrase, format!("zcrypt-dedup-{user_id}").as_bytes())
}

/// Generate a random 32-byte salt.
pub fn generate_salt() -> [u8; SALT_SIZE] {
    let mut salt = [0u8; SALT_SIZE];
    getrandom(&mut salt);
    salt
}

/// Generate a random per-file Content Encryption Key.
pub fn generate_cek() -> [u8; KEY_SIZE] {
    let mut cek = [0u8; KEY_SIZE];
    getrandom(&mut cek);
    cek
}

fn getrandom(buf: &mut [u8]) {
    use aes_gcm::aead::rand_core::RngCore;
    OsRng.fill_bytes(buf);
}

fn cipher(key: &[u8]) -> Result<Aes256Gcm, CryptoError> {
    Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::BadKey(key.len()))
}

/// Encrypt with a fresh random IV → `[IV || ct || tag]`.
pub fn encrypt_chunk(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = cipher(key)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| CryptoError::AuthFailed)?;
    let mut out = Vec::with_capacity(IV_SIZE + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt `[IV || ct || tag]`. Fails closed on any tampering.
pub fn decrypt_chunk(key: &[u8], wire: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if wire.len() < IV_SIZE + TAG_SIZE {
        return Err(CryptoError::TooShort(wire.len()));
    }
    let cipher = cipher(key)?;
    let nonce = Nonce::from_slice(&wire[..IV_SIZE]);
    cipher
        .decrypt(nonce, &wire[IV_SIZE..])
        .map_err(|_| CryptoError::AuthFailed)
}

/// Wrap (encrypt) a CEK under a KEK — same wire format as a chunk.
pub fn wrap_cek(kek: &[u8], cek: &[u8]) -> Result<Vec<u8>, CryptoError> {
    encrypt_chunk(kek, cek)
}

/// Unwrap a CEK. An auth failure here means "wrong passphrase".
pub fn unwrap_cek(kek: &[u8], wrapped: &[u8]) -> Result<Vec<u8>, CryptoError> {
    decrypt_chunk(kek, wrapped)
}

/// Resolve a file's content key from the passphrase: envelope files unwrap the
/// CEK; legacy files (no wrapped CEK) used the passphrase-derived key directly.
pub fn resolve_file_key(
    passphrase: &str,
    salt: &[u8],
    wrapped_cek: Option<&[u8]>,
) -> Result<Vec<u8>, CryptoError> {
    let kek = derive_key(passphrase, salt);
    match wrapped_cek {
        Some(wrapped) if !wrapped.is_empty() => unwrap_cek(&kek, wrapped),
        _ => Ok(kek.to_vec()),
    }
}

/// Lowercase-hex SHA-256.
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

// ── Warm key cache ──────────────────────────────────────────────────────────
// Process-wide, in-memory-only (never persisted) cache of resolved file keys.
// Desktop routes many small decrypts through decrypt_to_memory (thumbnails,
// preview, the viewer) — without this, opening a folder of N thumbnails pays
// PBKDF2-SHA256's 600k iterations N times for the SAME file+passphrase. Bounded
// (FIFO eviction) so it can't grow unbounded across a long session.
//
// Callers must clear this on lock/logout (`clear_key_cache`), same as the
// frontend's own CEK cache. Retaining a *derived* key in memory for the active
// session is the same trust boundary the app already assumes elsewhere (the
// desktop shell caches the passphrase itself for folder-watch); this cache
// holds nothing that isn't already resident for the session's duration.
const KEY_CACHE_CAP: usize = 64;

struct KeyCache {
    map: HashMap<String, Vec<u8>>,
    order: VecDeque<String>,
}

impl KeyCache {
    fn new() -> Self {
        KeyCache {
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.map.get(key).cloned()
    }

    fn put(&mut self, key: String, value: Vec<u8>) {
        if !self.map.contains_key(&key) {
            self.order.push_back(key.clone());
            if self.order.len() > KEY_CACHE_CAP {
                if let Some(oldest) = self.order.pop_front() {
                    self.map.remove(&oldest);
                }
            }
        }
        self.map.insert(key, value);
    }

    fn clear(&mut self) {
        self.map.clear();
        self.order.clear();
    }
}

fn key_cache() -> &'static Mutex<KeyCache> {
    static CACHE: OnceLock<Mutex<KeyCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(KeyCache::new()))
}

/// Cache key: file id + a hash of the passphrase — never the raw passphrase
/// itself, so a cache entry can't retain plaintext beyond what `resolve_file_key`
/// itself already handles, and a wrong-then-right retry with a DIFFERENT
/// passphrase can't collide with a stale entry from an earlier attempt.
fn key_cache_key(file_id: &str, passphrase: &str) -> String {
    format!("{file_id}:{}", sha256_hex(passphrase.as_bytes()))
}

/// Cached wrapper around [`resolve_file_key`]: a repeat call for the SAME file
/// id + passphrase (e.g. a folder of thumbnails decrypting one after another)
/// skips re-deriving PBKDF2 and returns the already-resolved key. A cache miss
/// falls through to the real derivation and populates the cache.
pub fn resolve_file_key_cached(
    file_id: &str,
    passphrase: &str,
    salt: &[u8],
    wrapped_cek: Option<&[u8]>,
) -> Result<Vec<u8>, CryptoError> {
    let cache_key = key_cache_key(file_id, passphrase);
    if let Some(key) = key_cache().lock().unwrap().get(&cache_key) {
        return Ok(key);
    }
    let resolved = resolve_file_key(passphrase, salt, wrapped_cek)?;
    key_cache().lock().unwrap().put(cache_key, resolved.clone());
    Ok(resolved)
}

/// Forget every cached key — call on vault lock / logout, mirroring the
/// frontend's own CEK cache eviction.
pub fn clear_key_cache() {
    key_cache().lock().unwrap().clear();
}

/// Lowercase-hex HMAC-SHA256 — the `hmac_v1` content MAC (key from
/// [`derive_dedup_key`]).
pub fn hmac_sha256_hex(key: &[u8], data: &[u8]) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("hmac accepts any key length");
    mac.update(data);
    hex::encode(mac.finalize().into_bytes())
}

/// Incremental file-level integrity hasher matching `sha256_scheme`.
pub enum ContentHasher {
    Plain(Sha256),
    HmacV1(Hmac<Sha256>),
}

impl ContentHasher {
    /// `scheme` "hmac_v1" needs the dedup key; anything else is plain SHA-256.
    pub fn new(scheme: &str, key: Option<&[u8]>) -> Self {
        match (scheme, key) {
            ("hmac_v1", Some(k)) => ContentHasher::HmacV1(
                <Hmac<Sha256> as Mac>::new_from_slice(k).expect("hmac accepts any key length"),
            ),
            _ => ContentHasher::Plain(Sha256::new()),
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        match self {
            ContentHasher::Plain(h) => h.update(data),
            ContentHasher::HmacV1(m) => m.update(data),
        }
    }

    pub fn finalize_hex(self) -> String {
        match self {
            ContentHasher::Plain(h) => hex::encode(h.finalize()),
            ContentHasher::HmacV1(m) => hex::encode(m.finalize().into_bytes()),
        }
    }
}

#[cfg(test)]
mod key_cache_tests {
    use super::*;

    // The cache is a process-wide static, and Rust runs tests in the same
    // process concurrently — every test below uses its own unique file_id
    // namespace so they can never observe each other's entries.

    #[test]
    fn cache_hit_returns_same_key_as_direct_derivation() {
        let salt = generate_salt();
        let direct = resolve_file_key("pw-cache-hit-test", &salt, None).unwrap();
        let cached_first =
            resolve_file_key_cached("file-cache-hit-test", "pw-cache-hit-test", &salt, None)
                .unwrap();
        let cached_second =
            resolve_file_key_cached("file-cache-hit-test", "pw-cache-hit-test", &salt, None)
                .unwrap();
        assert_eq!(direct, cached_first);
        assert_eq!(cached_first, cached_second);
    }

    #[test]
    fn different_passphrase_same_file_id_does_not_collide() {
        let salt = generate_salt();
        let a =
            resolve_file_key_cached("file-collision-test", "passphrase-a", &salt, None).unwrap();
        let b =
            resolve_file_key_cached("file-collision-test", "passphrase-b", &salt, None).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn clear_key_cache_forgets_entries() {
        let salt = generate_salt();
        let file_id = "file-clear-test";
        let pass = "pw-clear-test";
        resolve_file_key_cached(file_id, pass, &salt, None).unwrap();
        assert!(key_cache()
            .lock()
            .unwrap()
            .get(&key_cache_key(file_id, pass))
            .is_some());
        clear_key_cache();
        assert!(key_cache()
            .lock()
            .unwrap()
            .get(&key_cache_key(file_id, pass))
            .is_none());
    }

    #[test]
    fn eviction_caps_cache_size() {
        // Exercises KeyCache's own eviction policy directly with dummy values —
        // NOT via resolve_file_key_cached, which would mean paying for a genuine
        // 600k-iteration PBKDF2 on every one of these misses (a first version of
        // this test did exactly that and took cargo test from ~20s to ~630s).
        let mut cache = KeyCache::new();
        for i in 0..(KEY_CACHE_CAP + 8) {
            cache.put(format!("file-evict-test-{i}"), vec![0u8; 32]);
        }
        assert!(cache.map.len() <= KEY_CACHE_CAP);
    }
}
