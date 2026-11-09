//! Cross-implementation conformance. Rust verifier.
//!
//! Verifies zcrypt-core against the shared fixture
//! `app/backend/crypto/testvectors/vectors.json` (normative spec:
//! docs/CRYPTO_FORMAT.md), the same vectors the TS web client and the Go
//! sidecar pass. A file encrypted on any client must decrypt on every other.
//!
//! Regenerate the fixture with the Go reference generator:
//!   cd app/desktop/sidecar && ZCRYPT_GEN_VECTORS=1 go test ./crypto/ -run TestCryptoVectors

use base64::Engine;
use serde::Deserialize;
use zcrypt_core::{compression, crypto};

#[derive(Deserialize)]
struct Vectors {
    pbkdf2: Vec<Pbkdf2Vector>,
    gcm_decrypt: Vec<GcmVector>,
    cek_unwrap: Vec<UnwrapVector>,
    resolve_file_key: Vec<ResolveVector>,
    sha256: Vec<Sha256Vector>,
    hmac_sha256: Vec<HmacVector>,
    name_decrypt: Vec<NameVector>,
    zstd_roundtrip: Vec<ZstdVector>,
}

#[derive(Deserialize)]
struct Pbkdf2Vector {
    name: String,
    password: String,
    #[serde(default)]
    salt_hex: Option<String>,
    #[serde(default)]
    salt_text: Option<String>,
    key_hex: String,
}

#[derive(Deserialize)]
struct GcmVector {
    name: String,
    key_hex: String,
    wire_hex: String,
    plaintext_hex: String,
}

#[derive(Deserialize)]
struct UnwrapVector {
    name: String,
    kek_hex: String,
    wrapped_hex: String,
    cek_hex: String,
}

#[derive(Deserialize)]
struct ResolveVector {
    name: String,
    passphrase: String,
    salt_hex: String,
    wrapped_cek_b64: String,
    cek_hex: String,
}

#[derive(Deserialize)]
struct Sha256Vector {
    name: String,
    data_hex: String,
    sha256_hex: String,
}

#[derive(Deserialize)]
struct HmacVector {
    name: String,
    key_hex: String,
    data_hex: String,
    mac_hex: String,
}

#[derive(Deserialize)]
struct NameVector {
    name: String,
    passphrase: String,
    user_id: String,
    encrypted_b64: String,
    plaintext: String,
}

#[derive(Deserialize)]
struct ZstdVector {
    name: String,
    compressed_hex: String,
    plaintext_hex: String,
}

fn load() -> Vectors {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../backend/crypto/testvectors/vectors.json"
    );
    let data = std::fs::read_to_string(path).expect("vectors.json missing. See its README");
    serde_json::from_str(&data).expect("vectors.json parse")
}

fn unhex(s: &str) -> Vec<u8> {
    hex::decode(s).expect("bad hex in vector")
}

#[test]
fn conformance_pbkdf2() {
    for c in load().pbkdf2 {
        let salt = match (&c.salt_hex, &c.salt_text) {
            (Some(h), _) if !h.is_empty() => unhex(h),
            (_, Some(t)) => t.as_bytes().to_vec(),
            _ => panic!("vector {} has no salt", c.name),
        };
        let key = crypto::derive_key(&c.password, &salt);
        assert_eq!(hex::encode(key), c.key_hex, "pbkdf2 {}", c.name);
    }
}

#[test]
fn conformance_gcm_decrypt() {
    for c in load().gcm_decrypt {
        let plain = crypto::decrypt_chunk(&unhex(&c.key_hex), &unhex(&c.wire_hex))
            .unwrap_or_else(|e| panic!("gcm {}: {e}", c.name));
        assert_eq!(hex::encode(plain), c.plaintext_hex, "gcm {}", c.name);
    }
}

#[test]
fn conformance_cek_unwrap() {
    for c in load().cek_unwrap {
        let cek = crypto::unwrap_cek(&unhex(&c.kek_hex), &unhex(&c.wrapped_hex))
            .unwrap_or_else(|e| panic!("unwrap {}: {e}", c.name));
        assert_eq!(hex::encode(cek), c.cek_hex, "unwrap {}", c.name);
    }
}

#[test]
fn conformance_resolve_file_key() {
    for c in load().resolve_file_key {
        let wrapped = crypto::WrappedKey::parse(&c.wrapped_cek_b64).expect("b64");
        let cek = crypto::resolve_file_key(&c.passphrase, &unhex(&c.salt_hex), wrapped.as_ref())
            .unwrap_or_else(|e| panic!("resolve {}: {e}", c.name));
        assert_eq!(hex::encode(cek), c.cek_hex, "resolve {}", c.name);
    }
}

#[test]
fn conformance_sha256_and_hmac() {
    let v = load();
    for c in v.sha256 {
        assert_eq!(
            crypto::sha256_hex(&unhex(&c.data_hex)),
            c.sha256_hex,
            "sha256 {}",
            c.name
        );
    }
    for c in v.hmac_sha256 {
        assert_eq!(
            crypto::hmac_sha256_hex(&unhex(&c.key_hex), &unhex(&c.data_hex)),
            c.mac_hex,
            "hmac {}",
            c.name
        );
        // The streaming ContentHasher must agree with the one-shot MAC.
        let mut h = crypto::ContentHasher::new("hmac_v1", Some(&unhex(&c.key_hex)));
        h.update(&unhex(&c.data_hex));
        assert_eq!(h.finalize_hex(), c.mac_hex, "hmac stream {}", c.name);
    }
}

#[test]
fn conformance_name_decrypt() {
    let b64 = base64::engine::general_purpose::STANDARD;
    for c in load().name_decrypt {
        let key = crypto::derive_name_key(&c.passphrase, &c.user_id);
        let enc = b64.decode(&c.encrypted_b64).expect("b64");
        let plain =
            crypto::decrypt_chunk(&key, &enc).unwrap_or_else(|e| panic!("name {}: {e}", c.name));
        assert_eq!(
            String::from_utf8(plain).unwrap(),
            c.plaintext,
            "name {}",
            c.name
        );
    }
}

#[test]
fn conformance_zstd_roundtrip() {
    for c in load().zstd_roundtrip {
        let plain = compression::decompress(&unhex(&c.compressed_hex))
            .unwrap_or_else(|e| panic!("zstd {}: {e}", c.name));
        assert_eq!(hex::encode(plain), c.plaintext_hex, "zstd {}", c.name);
    }
}

/// Encrypt side (random IV): every other implementation must be able to read
/// what this one writes; locally we prove round-trip + tamper rejection.
#[test]
fn encrypt_roundtrip_and_tamper() {
    let key = crypto::generate_cek();
    let plain = b"cross-client bytes".repeat(50);
    let mut wire = crypto::encrypt_chunk(&key, &plain).unwrap();
    assert_eq!(wire.len(), plain.len() + 28);
    assert_eq!(crypto::decrypt_chunk(&key, &wire).unwrap(), plain);
    let last = wire.len() - 1;
    wire[last] ^= 0xff;
    assert!(crypto::decrypt_chunk(&key, &wire).is_err());
}

/// Test bytes stored as the pattern that makes them, never as raw key material.
#[derive(Deserialize)]
struct Pattern {
    start: u8,
    step: u8,
    len: usize,
}

impl Pattern {
    fn bytes(&self) -> Vec<u8> {
        (0..self.len)
            .map(|i| self.start.wrapping_add(self.step.wrapping_mul(i as u8)))
            .collect()
    }

    fn arr32(&self) -> [u8; 32] {
        self.bytes().try_into().unwrap()
    }
}

#[derive(Deserialize)]
struct Pk1Vectors {
    recipient: Pattern,
    recipient_public_hex: String,
    seal: Vec<Pk1SealVector>,
    cek_mac: Vec<CekMacVector>,
}

#[derive(Deserialize)]
struct Pk1SealVector {
    name: String,
    eph: Pattern,
    iv_hex: String,
    data_hex: String,
    sealed_b64: String,
}

#[derive(Deserialize)]
struct CekMacVector {
    name: String,
    cek: Pattern,
    data_hex: String,
    mac_hex: String,
}

fn pk1_vectors() -> Pk1Vectors {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../backend/crypto/testvectors/pk1_vectors.json"
    );
    serde_json::from_str(&std::fs::read_to_string(path).expect("read pk1_vectors.json"))
        .expect("parse pk1_vectors.json")
}

fn arr32(h: &str) -> [u8; 32] {
    hex::decode(h).unwrap().try_into().unwrap()
}

#[test]
fn conformance_pk1_seal_matches_the_web_client_byte_for_byte() {
    use zcrypt_core::pk1;
    let v = pk1_vectors();
    let secret = v.recipient.arr32();
    let public = arr32(&v.recipient_public_hex);
    for case in &v.seal {
        let sealed = base64::engine::general_purpose::STANDARD
            .decode(&case.sealed_b64)
            .unwrap();
        let data = hex::decode(&case.data_hex).unwrap();
        assert_eq!(
            pk1::open_sealed(&secret, &sealed).unwrap(),
            data,
            "open: {}",
            case.name
        );
        let iv: [u8; 12] = hex::decode(&case.iv_hex).unwrap().try_into().unwrap();
        let ours = pk1::seal_with_fixed_for_vectors(case.eph.arr32(), iv, &public, &data).unwrap();
        assert_eq!(ours, sealed, "seal: {}", case.name);
    }
}

#[test]
fn conformance_pk1_cek_mac() {
    use zcrypt_core::pk1;
    for case in &pk1_vectors().cek_mac {
        let cek = case.cek.bytes();
        let data = hex::decode(&case.data_hex).unwrap();
        assert_eq!(pk1::cek_mac_hex(&cek, &data), case.mac_hex, "{}", case.name);
    }
}
