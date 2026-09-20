# Cross-implementation crypto conformance vectors

`vectors.json` is the shared fixture that every zcrypt client implementation
must pass, so a file encrypted on any client decrypts on all others. The
normative format spec is [`docs/CRYPTO_FORMAT.md`](../../../../docs/CRYPTO_FORMAT.md).

**Do not hand-edit `vectors.json`.** It is a frozen fixture that every
implementation verifies against. The Go reference writer that generated it was
deleted along with the desktop sidecar (`36c1d37`), so there is no regeneration
command any more:

| Implementation | Role | Command |
|---|---|---|
| TypeScript (`app/frontend/lib/crypto.ts`) | verify | `cd app/frontend && bun run vitest run __tests__/lib/crypto-vectors.test.ts` |
| Rust (`app/core`) | verify | `cargo test -p zcrypt-core conformance` |

Covered: PBKDF2-SHA256 600k (hex + UTF-8 text salts, Unicode passphrase),
AES-256-GCM decrypt of the `[12B IV || ct || 16B tag]` wire format, CEK unwrap,
end-to-end passphrase→KEK→CEK resolution, SHA-256, `hmac_v1` content MAC under
the dedup key, per-user name decryption, and a zstd round-trip blob (format
compatibility only: encoders may differ byte-wise; TS skips zstd because the
wasm codec can't load under jsdom).

If you change ANY crypto behavior: update the spec, regenerate here, and make
every implementation green in the same change.
