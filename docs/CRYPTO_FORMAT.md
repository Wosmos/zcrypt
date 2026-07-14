# zcrypt Cryptographic Format Specification

**Status: NORMATIVE.** Every zcrypt client implementation (web TypeScript, Go
sidecar/backend, Rust core) MUST produce byte-identical results for the
operations below. A file encrypted by any client must decrypt on every other
client. Conformance is enforced by the shared test vectors in
`app/backend/crypto/testvectors/vectors.json` — see the README there for how to
regenerate and verify them. **Do not change anything in this document without
regenerating the vectors and updating every implementation in the same change.**

Reference implementations:
- TypeScript: `app/frontend/lib/crypto.ts`, `app/frontend/lib/name-crypto.ts`
- Go: `app/desktop/sidecar/crypto/{pbkdf2,aes,hash}.go`
- Rust: `app/core` (must pass the vectors)

## 1. Primitives

| Primitive | Parameters |
|---|---|
| Key derivation | PBKDF2-HMAC-SHA256, **600,000 iterations**, dkLen = 32 bytes |
| Content cipher | AES-256-GCM, 12-byte IV, 16-byte tag, **no AAD** |
| Content hash | SHA-256, lowercase hex |
| Keyed content MAC | HMAC-SHA256, lowercase hex (`sha256_scheme = "hmac_v1"`) |
| Compression | zstd (standard frame format) |
| Text encoding | UTF-8 everywhere a string becomes bytes |
| Base64 | Standard alphabet **with** padding (`btoa` / Go `base64.StdEncoding`) |

## 2. Key hierarchy

```
passphrase ──PBKDF2(salt, 600k)──► KEK (32B)
                                     │ AES-256-GCM wrap
                                     ▼
                         CEK (32B, random per file) ──► encrypts every chunk
```

- **Salt**: 32 random bytes, generated at upload, stored server-side
  (`files.salt`, base64).
- **KEK** = `PBKDF2-SHA256(passphrase_utf8, salt, 600000, 32)`.
- **CEK** = 32 random bytes per file.
- **Wrapped CEK** = `AESGCM_ENCRYPT(KEK, CEK)` in the wire format of §3, stored
  base64 in `files.wrapped_cek`.
- **Legacy files** (`wrapped_cek` empty/absent): chunks are encrypted directly
  with the KEK. New writes MUST always use the envelope.

Derived sub-keys (same PBKDF2, text salts, UTF-8):
- **Name key**: salt = `"zcrypt-names-" + userId`. Encrypts file/folder names
  (`encrypted_name`) and style blobs (`encrypted_style`) in the §3 wire format,
  base64-encoded.
- **Dedup/MAC key**: salt = `"zcrypt-dedup-" + userId`. Keys the `hmac_v1`
  content MAC (§5).

## 3. AES-GCM wire format

All AES-GCM outputs (chunks, wrapped CEKs, encrypted names/styles) use ONE
layout:

```
[ 12-byte IV ][ ciphertext (= plaintext length) ][ 16-byte GCM tag ]
```

- IV is random per encryption; never reused with the same key.
- No associated data (AAD is empty).
- Total size = plaintext length + 28 bytes.
- Decryption MUST fail (auth error) on any tampering; implementations map that
  to a "wrong passphrase / corrupt data" error, never a partial plaintext.

## 4. Chunk pipeline

Upload, per file:
1. Compute the file-level content hash (§5) over the **original plaintext**.
2. Generate salt, derive KEK, generate CEK, wrap CEK.
3. Split the plaintext into fixed-size chunks (device-profile tiered: 4 MiB
   light / 10 MiB normal / 16 MiB intense / 32 MiB ludicrous; final chunk is
   the remainder). Chunk boundaries are over the ORIGINAL plaintext.
4. Per chunk, in order:
   a. **Compress** with zstd IF the filename's extension is not on the
      skip-list (already-compressed formats — see
      `sidecar/compression/extensions.go`) AND the compressed output is at
      least **5% smaller** than the input; otherwise send the raw plaintext
      and mark the chunk `compressed = false`.
   b. **Encrypt** the (possibly compressed) bytes with the CEK → §3 wire.
   c. **SHA-256** the encrypted wire bytes → the chunk's `sha256`
      (transport-integrity check; recomputed by the receiver before decrypt).
5. The per-chunk `compressed` flag travels with the chunk
   (`X-Chunk-Compressed` header / `chunks.compressed`).

Download reverses it: fetch → verify chunk SHA-256 → decrypt → decompress if
flagged → concatenate in index order → verify the file-level hash (§5).

zstd note: compressed output is NOT required to be byte-identical across
implementations (encoders differ); only round-trip compatibility with the
standard zstd frame format is required. Levels map: profile z1 → fastest,
z2 → default, z3 → better.

## 5. File-level integrity (`sha256_scheme`)

- `"plain"` (legacy): lowercase-hex SHA-256 of the whole original plaintext.
- `"hmac_v1"` (current): lowercase-hex **HMAC-SHA256(dedup_key, plaintext)**
  where dedup_key is from §2. Deterministic per (user, passphrase, content) so
  dedupe/resume still work, but unlinkable without the passphrase.
- Recipients who lack the passphrase (public shares, space members) cannot
  recompute an `hmac_v1` MAC; they rely on per-chunk GCM tags + chunk-count
  completeness instead and MUST skip the file-level compare.

## 6. Shared vaults (spaces)

Out of scope for this document except: a member-visible file carries the CEK
re-wrapped under the **space key** (`wrapped_cek` per member grant) and a name
re-wrapped likewise (`wrapped_name`); the wrap format is §3. Space-key
sealing uses X25519 ECIES (see `app/frontend/lib/spaces.ts`) — vectors TBD when
the Rust core implements spaces.

## 7. Conformance vectors

`app/backend/crypto/testvectors/vectors.json` contains fixed-input vectors for:
PBKDF2 (incl. a Unicode passphrase), GCM decrypt (wire → plaintext), CEK
unwrap, end-to-end passphrase→KEK→CEK resolution, SHA-256, HMAC-SHA256 +
dedup-key derivation, name decryption, and a zstd round-trip blob.

- **Generate** (Go is the reference writer):
  `cd app/desktop/sidecar && ZCRYPT_GEN_VECTORS=1 go test ./crypto/ -run TestCryptoVectors`
- **Verify Go**: same command without the env var.
- **Verify TS**: `cd app/frontend && bun run vitest run __tests__/lib/crypto-vectors.test.ts`
  (zstd is exempt on TS — the wasm codec isn't loadable under jsdom; the format
  guarantee covers it, and Rust/Go verify the blob.)
- **Verify Rust** (once `app/core` exists): `cargo test -p zcrypt-core conformance`.
