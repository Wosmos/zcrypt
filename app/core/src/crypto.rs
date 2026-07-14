//! Zero-knowledge crypto primitives.
//!
//! NORMATIVE: byte-compatible with docs/CRYPTO_FORMAT.md and enforced by the
//! shared vectors (`tests/conformance.rs`). Mirrors the web client
//! (`app/frontend/lib/crypto.ts`) and the Go sidecar
//! (`app/desktop/sidecar/crypto`).
//!
//! Wire format for every AES-GCM output (chunks, wrapped CEKs, names):
//! `[12-byte IV || ciphertext || 16-byte GCM tag]`, no AAD.

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
