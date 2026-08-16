# Test coverage roadmap

Status as of 2026-08-12. Written after taking the frontend to a true 100% and
fixing the Go coverage measurement, so the numbers below are measured, not
estimated.

**The governing principle:** coverage is not the goal. zcrypt is zero-knowledge
encrypted storage — the user holds the only copy of their data and we cannot
inspect it. The one unrecoverable failure is *silent* data loss or silent
integrity/crypto breakage. So test effort goes where that failure lives, and
nowhere else on principle.

---

## Measured baseline

### Frontend — DONE, pinned

`lib/**`, `hooks/**`, `store/**`: **100% statements / branches / functions /
lines** (5,080 / 2,429 / 1,205 / 4,380), 1,753 tests across 102 files.
`vitest.config.ts` pins all four thresholds at 100, so regressions fail the
pre-push gate. `components/**` and `app/**` are deliberately out of scope —
they're covered by the Playwright suite at `tests/e2e/`.

### Go backend — 38.0% (3,181 / 8,377 statements)

Measured with `scripts/coverage-backend.sh`, which merges the unit and
integration profiles with `-coverpkg=./...`. **Do not quote `go test -cover
./...`** — it reports `cmd` at 2.0% and `index` at 0.3% because the
build-tagged integration suite is invisible to it. See
[the measurement note](#appendix-why-the-old-go-numbers-were-wrong).

| Package | Statements | Coverage | LOC |
|---|---|---|---|
| `cmd` (HTTP handlers) | 4,864 | **28.9%** | 11,931 |
| `index` (pgxpool / raw SQL) | 1,790 | **35.3%** | 5,850 |
| `adapters` | 884 | 72.5% | 3,493 |
| `auth` | 299 | 71.9% | 1,719 |
| `config` | 134 | 97.8% | 784 |
| `crypto` | 61 | 86.9% | 477 |
| `reppool` | 30 | 76.7% | 153 |
| `disguise` | 14 | 85.7% | 188 |
| `chunks` / `pipeline` / `types` | 68 | 100% | 1,528 |
| `.` (main) | 112 | **0.0%** | 259 |
| `tools/reseal` | 121 | **0.0%** | 232 |

### Rust — 42.5% core, 0% desktop

| Scope | Regions | Lines | Functions |
|---|---|---|---|
| `app/core` | **42.47%** | 42.41% | 42.13% |
| `app/desktop/src-tauri` | **0.00%** | 0.00% | 0.00% |
| combined | 37.2% | 36.6% | 33.2% |

Every large gap in `app/core` is a network path, and `[dev-dependencies]` is
**empty** — there is no HTTP mocking harness. That single missing dependency is
what makes ~2,300 lines untestable:

| File | Uncovered regions | Coverage |
|---|---|---|
| `engines/sync.rs` | 630 | **0%** |
| `engines/stream_upload.rs` | 578 | **0%** |
| `engines/download.rs` | 519 | **0%** |
| `engines/decrypt_to_memory.rs` | 289 | **0%** |
| `api/upload.rs` | 253 | **0%** |
| `api/client.rs` | 170 | 13.7% |
| `api/download.rs` | 64 | **0%** |
| `engines/delete.rs` | 47 | **0%** |
| `src-tauri/lib.rs` | 904 | **0%** |

---

## P0 — do now

### 1. Commit the frontend + tooling work

~30 modified files and `scripts/coverage-backend.sh` are sitting uncommitted on
`main`. Everything is green (tests, typecheck, lint, format, build). This is
pure downside risk until it lands.

### 2. Rust data plane → ~85% on `app/core`

**This is the single highest-value work available in the repo**, and it would be
first even if nobody cared about coverage. `sync`, `stream_upload`, `download`
and `decrypt_to_memory` are the code that moves and encrypts user bytes, and
they are at a flat 0%.

Two live issues are exactly this failure class:

- **HF chunk data loss** — ~237 files' chunks marked `synced` in the index but
  404 on HuggingFace. The symptom looked like a thumbnail/download bug; the
  cause is a storage-sync integrity defect.
- **Upload pipeline failures** — root cause was counting chunk rows instead of
  `DISTINCT`, so a duplicate row inflated the completed count.

Neither is the kind of bug you find by reading code. Both are the kind a test
against a mocked platform catches immediately.

Steps:

1. Add `wiremock` + `tempfile` to `app/core`'s `[dev-dependencies]`.
2. Point `ApiClient::new(base_url, …)` (`src/api/client.rs:111`) at
   `server.uri()`. Use the `127.0.0.1` URI as-is — an IP literal skips DNS,
   which matters because the client installs a custom Cloudflare-backed
   `PublicDnsResolver` that will not resolve a hostname under test.
3. Cover in this order (highest uncovered regions first): `sync`,
   `stream_upload`, `download`, `decrypt_to_memory`, `api/upload`,
   `api/client` (token refresh, retry, error mapping), `api/download`,
   `engines/delete`.
4. **Write a named regression test for the chunk-marked-synced-but-absent
   shape** before doing anything else in `sync.rs`. That's the whole point.

**Target: ~85% on `app/core`. Stop there.** Do not chase the remainder.

### 3. Make the measurement permanent

The fix currently only exists in `scripts/coverage-backend.sh`. Push it into CI
so the honest number is the one everyone sees:

- `.github/workflows/ci.yml`: backend job uses `-coverpkg=./...`; the
  integration job emits a profile; publish the merged total.
- Add `cargo llvm-cov --fail-under-lines <N>` so Rust ratchets upward.

---

## P1 — do next

### 4. Go integrity-critical handlers

Not a sweep of `cmd`. These files specifically, because they can lose or
mis-account data:

`cmd/upload.go` (1,066) · `cmd/download.go` (176) · `cmd/sync_worker.go` (322) ·
`cmd/cleanup.go` (583) · `cmd/delete.go` (216) · `cmd/reconcile.go` (154)

Use the existing integration harness (`setupTestServer`, `enableMockStorage`,
`registerAndLogin` in `integration/helpers_test.go`) rather than building new
scaffolding.

### 5. Go `index` — invariants only

Cover the queries that enforce something: chunk dedupe and the
`UNIQUE(file_id, idx)` constraint, quota accounting, the audit chain
(`index/audit_queries.go`), and integrity queries. **Not** the other ~40
CRUD wrappers.

### 6. `auth` 71.9% → ~90%

Security-relevant and cheap (299 statements). A prior review flagged 2FA
brute-force protection as a real weakness; that path deserves explicit tests.

---

## P2 — worth doing, not urgent

- **`tools/reseal` (0%) and `main.go` (0%)** — 353 statements total. A smoke
  test each. Small, easy, closes two conspicuous zeroes.
- **Rust `reppool` (28%), `profiles` (21%), `engines/mod` (38.6%)** — pure logic,
  no harness needed.
- **Platform adapters** — Go 72.5%, Rust 40–67%. Both hardcode their hosts
  (`const API: &str = "https://api.github.com"`), so they cannot be aimed at a
  mock server without making the base URL a field or a `cfg(test)`-overridable
  const. **This is a decision, not a task:** it's a production-shape change for
  testability. Worth it if adapter bugs have burned you; skip otherwise.

---

## Explicitly NOT doing

Each of these is a deliberate call, not a backlog item.

| Not doing | Why |
|---|---|
| **100% on Go `index`** | 5,850 LOC of thin SQL wrappers. One round-trip test per query mostly proves Postgres works. Near-zero bug yield per test, real maintenance cost. |
| **`src-tauri` 0% → 70%** | Thin wrappers over `zcrypt-core`. The actual risk is the IPC contract, which Playwright covers better than unit tests can. Cover error mapping if convenient; nothing more. |
| **The last ~10% anywhere** | Bug yield collapses. Evidence: taking the frontend 98.29% → 100% found **zero bugs** — it produced refactoring value (dead code removed, types tightened) but no defects. |
| **Replicating the 100% standard on the backends** | Holding 100% on the frontend is now nearly free — the tests exist and the threshold is pinned. Reaching it on 18k LOC of Go and 6.4k of Rust is weeks of work whose final third is negative value. |
| **Branch-completionism on invariant guards** | A 100% branch target pressures you to delete safety nets or write tests that assert nothing. Where a guard is unreachable by construction, mark it (`/* v8 ignore start */` + the reason) and move on. |
| **Unit-testing `components/**` / `app/**`** | 365 files, 61.8k LOC. Playwright at `tests/e2e/` owns this layer. |

---

## Sensible targets

Not 100%. These are the numbers that reflect risk:

| Area | Now | Target | Rationale |
|---|---|---|---|
| Frontend `lib/hooks/store` | 100% | **hold 100%** | Already paid for; pinned. |
| Rust `app/core` | 42.5% | **~85%** | Data plane. The one that matters. |
| Go `cmd` | 28.9% | **~65%** | Integrity-critical handlers, not all of them. |
| Go `index` | 35.3% | **~50%** | Invariant queries only. |
| Go `auth` | 71.9% | **~90%** | Security-relevant and cheap. |
| Go overall | 38.0% | **~60%** | Consequence of the above, not a target itself. |
| `src-tauri` | 0% | **~20%** | Error mapping only. |

Enforce these as **ratchets** (fail only if the number drops), never as
absolutes. A hard floor on a number nobody chose is how you end up writing tests
that assert nothing.

---

## Appendix: why the old Go numbers were wrong

`app/backend/integration/` holds 3,369 LOC of tests driving real HTTP handlers
against a real Postgres. It was invisible to coverage twice over:

1. It sits behind `//go:build integration`, and the tag was never set in the
   coverage run.
2. Even with the tag, Go's per-package coverage credits nothing to `cmd` or
   `index` without `-coverpkg` — the tests live in their own package.

`scripts/coverage-backend.sh` fixes both: it boots a throwaway Postgres on
:5434 via the Postgres.app binaries when `TEST_DATABASE_URL` is unset (there is
no Docker on this machine; CI keeps its `postgres:16-alpine` service on :5433),
runs both suites with `-coverpkg=./...`, merges the two text profiles with an
awk max-per-block pass, and prints statement-weighted per-package totals.

The correction was large — `cmd` 2.0% → 28.9%, `index` 0.3% → 35.3%, total
~20% → 38.0%. Roughly twenty minutes of work that prevented weeks of writing
tests for code that was already covered. **Measure before you grind.**
