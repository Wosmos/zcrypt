# Frontend Tests

> **Note:** The file/test counts below are out of date (the suite is much larger now).
> The `__tests__/` directory and `bun run test -- --coverage` are authoritative.

## Setup

- **Framework:** [Vitest](https://vitest.dev/) v4.x
- **DOM:** jsdom
- **Assertions:** Vitest built-in + `@testing-library/jest-dom`
- **Runner:** `bun run test` (or `bun run test:watch` for dev)

## Structure

```
__tests__/
  lib/
    crypto.test.ts          # AES-256-GCM encrypt/decrypt, key derivation, SHA-256
    crypto-pipeline.test.ts  # Multi-chunk pipeline simulation, integrity checks
    utils.test.ts            # formatBytes, formatEta, getFileTypeInfo
  store/
    passphrase.test.ts       # Zustand passphrase store, TTL, cache behavior
```

## Test Categories

### P0 — Data Loss Prevention (29 tests)
These tests verify the zero-knowledge encryption pipeline. A failure here means user data could be permanently lost or corrupted.

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `crypto.test.ts` | 20 | Salt generation, key derivation (PBKDF2), encrypt/decrypt roundtrip, wrong passphrase rejection, tampered data detection, empty/large chunks, SHA-256, base64 |
| `crypto-pipeline.test.ts` | 9 | Multi-chunk split/encrypt/reassemble, hash stability, wrong chunk order, per-chunk overhead (28 bytes), 1MB chunk, single-bit corruption detection, unicode/edge-case passphrases |

### P2 — Utilities & State (21 tests)
| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `utils.test.ts` | 14 | Byte formatting, ETA calculation, file type detection |
| `passphrase.test.ts` | 7 | Passphrase caching, TTL expiry, store reset |

## Running

```bash
# Run all tests
bun run test

# Run specific file
bun run test -- __tests__/lib/crypto.test.ts

# Watch mode
bun run test:watch

# Verbose output
bun run test -- --reporter=verbose
```

## Adding Tests

1. Create test file in the appropriate `__tests__/` subdirectory
2. Use `@/` alias for imports (e.g., `import { encryptChunk } from "@/lib/crypto"`)
3. Follow naming: `<module-name>.test.ts`
4. P0 tests (crypto, upload, data integrity) must pass before merge
