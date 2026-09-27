# Load Testing

k6-based load tests for the zcrypt backend.

## Prerequisites

```bash
# macOS
brew install k6

# or via the official installer
https://k6.io/docs/getting-started/installation/
```

## Before you run

Make sure the backend is running locally with rate limiting disabled:

```bash
# In app/backend/.env - already set:
DEV_MODE=true
```

```bash
cd app/backend && go run . &
```

## Test suites

| Script | VUs | Duration | Purpose |
|--------|-----|----------|---------|
| `smoke.js` | 1 | 30s | Confirms all endpoints respond. Run first |
| `auth.js` | 20–50 | 4m | Login/refresh throughput (bcrypt cost validation) |
| `upload.js` | 5–25 | 3m | Upload pipeline (init → chunk → complete) |
| `stress.js` | 0→300 | 12m | Find the breaking point |
| `soak.js` | 20 | 30m | Detect memory/goroutine leaks over time |

## Run commands

```bash
# Step 1 - smoke test (always run this first)
k6 run tests/load/k6/smoke.js

# Step 2 - auth load
k6 run tests/load/k6/auth.js

# Step 3 - upload pipeline
k6 run tests/load/k6/upload.js

# Step 4 - stress (find breaking point)
k6 run tests/load/k6/stress.js

# Step 5 - soak (leak detection, runs 30 min)
k6 run tests/load/k6/soak.js

# Shorter soak for quick check
SOAK_DURATION=5m k6 run tests/load/k6/soak.js
```

## Against a remote server

```bash
K6_BASE_URL=https://your-backend.railway.app k6 run tests/load/k6/smoke.js
```

**Note:** Only run stress/soak against remote if `DEV_MODE=true` is set there too.
Rate limiting will block VUs otherwise (returns 429).

## Docker sandbox (recommended for anything beyond a quick smoke check)

Running `stress.js`/`soak.js` needs somewhere safe to point them: not a bare
`go run .` (unrealistic resource limits) and never real production, since
that means real GitHub/GitLab/HuggingFace/Telegram accounts and the real
Neon DB. `docker-compose.loadtest.yml` gives you a disposable stack that
approximates Railway (backend, resource-capped) + a Vercel-like production
build (frontend, optional) and swaps every real storage platform for a
disk-backed `mock` adapter (`app/backend/adapters/mock.go`) that's only
reachable when `ZCRYPT_ENABLE_MOCK_ADAPTER=true` is explicitly set — unset
(the default, and required in real prod) rejects `"mock"` exactly like any
other unsupported platform.

**This stack never reaches real Neon or any real platform account.** That's
what makes running `stress`/`soak` here safe, instead of ever pointing
`test-load-staging` at production.

```bash
cp .env.loadtest.example .env.loadtest   # fresh MASTER_KEY/ZCRYPT_JWT_SECRET, see the file's comments

make loadtest-docker-up      # postgres + backend only (frontend is a manual, optional profile: --profile full)
make loadtest-docker-seed    # one-shot: connects the shared "mock" platform, marks it global
make loadtest-docker-smoke   # 1 VU / 30s -- confirms the whole wiring before spending more time
make loadtest-docker-auth    # login/refresh throughput against the containerized, resource-capped backend
make loadtest-docker-upload  # full init -> chunk -> complete -> async sync -> mock adapter path

# or all four in order:
make loadtest-docker-safe

# only after the above look clean, run these manually against the same stack:
k6 run --env K6_BASE_URL=http://localhost:8080 tests/load/k6/stress.js
k6 run --env K6_BASE_URL=http://localhost:8080 tests/load/k6/soak.js

make loadtest-docker-reset   # wipe Postgres + mock-storage volumes between full runs
make loadtest-docker-down    # stop without wiping
```

Watch backend container logs (`docker compose -f docker-compose.loadtest.yml logs -f backend`)
for `sync-worker: no adapter for chunk...` during the upload test -- that
means the seed step didn't take (rerun `make loadtest-docker-seed`). Expect
the containers' CPU/memory caps to become the bottleneck sooner than real
Railway; that's expected, and the reason this exists.

## Key metrics to watch

- `login_duration` p95: should be < 400ms (bcrypt is intentionally slow ~150ms)
- `refresh_duration` p95: should be < 80ms (JWT verify only)
- `upload_init_duration` p95: should be < 200ms (DB write + pool lookup)
- `chunk_upload_duration` p95: should be < 1s (disk write to staging)
- `http_req_failed`: should stay < 1% at normal load
- `upload_failures`: should stay < 5%

## What to watch on the server side

- **Neon CU-hours**: open Neon dashboard → Monitoring. Should flatline (event-driven
  sync_worker means 0 idle DB hits; connections drain after 30s idle).
- **Memory**: watch Railway/Oracle metrics for linear growth (goroutine leak).
- **DB connections**: should never exceed 5 (pgxpool MaxConns=5).
- **Errors in backend logs**: look for `context deadline exceeded` or `connection refused`.
