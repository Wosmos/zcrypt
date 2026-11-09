//! Public-key backup format (`pk1`), docs/CRYPTO_FORMAT.md §2.2.
//!
//! Automatic backup runs with the vault locked, so it holds no passphrase,
//! master key or name key. It seals each file's key and name to the account's
//! X25519 public key instead: the backup device can add files but can never
//! read the vault. The construction matches `sealTo` in
//! `app/frontend/lib/keys.ts`, and `tests/conformance.rs` checks both against
//! `app/backend/crypto/testvectors/pk1_vectors.json`.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

use crate::crypto::{decrypt_chunk, hmac_sha256_hex, CryptoError, IV_SIZE, KEY_SIZE};

/// Prefix of a `wrapped_cek` or name sealed to the account public key.
pub const PK1_PREFIX: &str = "pk1:";
/// `sha256_scheme` of a backup file: an HMAC keyed from the file's own CEK.
pub const CEK_MAC_SCHEME: &str = "cek_hmac_v1";
const CEK_MAC_INFO: &[u8] = b"zcrypt-cek-mac-v1";
const PUBLIC_KEY_SIZE: usize = 32;

fn seal_key(shared: &[u8], ephemeral: &[u8], recipient: &[u8]) -> [u8; KEY_SIZE] {
    let mut h = Sha256::new();
    h.update(shared);
    h.update(ephemeral);
    h.update(recipient);
    h.finalize().into()
}

fn seal_with(
    ephemeral: StaticSecret,
    iv: [u8; IV_SIZE],
    recipient: &[u8; PUBLIC_KEY_SIZE],
    data: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let ephemeral_public = PublicKey::from(&ephemeral);
    let shared = ephemeral.diffie_hellman(&PublicKey::from(*recipient));
    let mut key = seal_key(shared.as_bytes(), ephemeral_public.as_bytes(), recipient);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| CryptoError::BadKey(key.len()))?;
    key.zeroize();
    let ct = cipher
        .encrypt(Nonce::from_slice(&iv), data)
        .map_err(|_| CryptoError::AuthFailed)?;
    let mut out = Vec::with_capacity(PUBLIC_KEY_SIZE + IV_SIZE + ct.len());
    out.extend_from_slice(ephemeral_public.as_bytes());
    out.extend_from_slice(&iv);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Seals `data` so only the holder of `recipient`'s private key can open it.
/// Layout: `ephemeral_public[32] || IV[12] || ciphertext || tag[16]`.
pub fn seal_to(recipient: &[u8; PUBLIC_KEY_SIZE], data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let mut iv = [0u8; IV_SIZE];
    aes_gcm::aead::rand_core::RngCore::fill_bytes(&mut OsRng, &mut iv);
    seal_with(StaticSecret::random_from_rng(OsRng), iv, recipient, data)
}

/// Opens a [`seal_to`] blob with the recipient's private key.
pub fn open_sealed(
    recipient_secret: &[u8; KEY_SIZE],
    sealed: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if sealed.len() < PUBLIC_KEY_SIZE {
        return Err(CryptoError::TooShort(sealed.len()));
    }
    let (ephemeral, wire) = sealed.split_at(PUBLIC_KEY_SIZE);
    let ephemeral: [u8; PUBLIC_KEY_SIZE] = ephemeral
        .try_into()
        .map_err(|_| CryptoError::TooShort(sealed.len()))?;
    let secret = StaticSecret::from(*recipient_secret);
    let recipient = PublicKey::from(&secret);
    let shared = secret.diffie_hellman(&PublicKey::from(ephemeral));
    let mut key = seal_key(shared.as_bytes(), &ephemeral, recipient.as_bytes());
    let out = decrypt_chunk(&key, wire);
    key.zeroize();
    out
}

/// `"pk1:" + base64(seal_to(recipient, data))`: a `wrapped_cek` or a name.
pub fn seal_pk1(recipient: &[u8; PUBLIC_KEY_SIZE], data: &[u8]) -> Result<String, CryptoError> {
    let sealed = seal_to(recipient, data)?;
    Ok(format!(
        "{PK1_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(sealed)
    ))
}

/// True for a value sealed with [`seal_pk1`].
pub fn is_pk1(value: &str) -> bool {
    value.starts_with(PK1_PREFIX)
}

/// The `cek_hmac_v1` content MAC: HMAC-SHA256 keyed by
/// HKDF-SHA256(CEK, salt = empty, info = "zcrypt-cek-mac-v1").
pub fn cek_mac_key(cek: &[u8]) -> [u8; KEY_SIZE] {
    let mut key = [0u8; KEY_SIZE];
    Hkdf::<Sha256>::new(None, cek)
        .expand(CEK_MAC_INFO, &mut key)
        .expect("32 bytes is a valid HKDF-SHA256 length");
    key
}

/// Lowercase-hex `cek_hmac_v1` MAC of a whole plaintext held in memory.
pub fn cek_mac_hex(cek: &[u8], plaintext: &[u8]) -> String {
    let mut key = cek_mac_key(cek);
    let mac = hmac_sha256_hex(&key, plaintext);
    key.zeroize();
    mac
}

/// Deterministic seal for conformance vectors only: a fixed ephemeral key and
/// IV must never be used for real data.
#[doc(hidden)]
pub fn seal_with_fixed_for_vectors(
    ephemeral_secret: [u8; KEY_SIZE],
    iv: [u8; IV_SIZE],
    recipient: &[u8; PUBLIC_KEY_SIZE],
    data: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    seal_with(StaticSecret::from(ephemeral_secret), iv, recipient, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_values_open_only_with_the_matching_private_key() {
        let secret = [7u8; 32];
        let public = *PublicKey::from(&StaticSecret::from(secret)).as_bytes();
        let sealed = seal_to(&public, b"cek bytes").unwrap();
        assert_eq!(open_sealed(&secret, &sealed).unwrap(), b"cek bytes");
        assert!(open_sealed(&[8u8; 32], &sealed).is_err());
        let mut tampered = sealed.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(open_sealed(&secret, &tampered).is_err());
        assert!(open_sealed(&secret, &sealed[..10]).is_err());
    }

    #[test]
    fn every_seal_is_unique() {
        let public = *PublicKey::from(&StaticSecret::from([7u8; 32])).as_bytes();
        assert_ne!(
            seal_to(&public, b"same").unwrap(),
            seal_to(&public, b"same").unwrap()
        );
        let value = seal_pk1(&public, b"same").unwrap();
        assert!(is_pk1(&value) && !is_pk1("mk1:abc"));
    }
}
