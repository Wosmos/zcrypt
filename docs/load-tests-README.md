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
# In app/backend/.env — already set:
DEV_MODE=true
```

```bash
cd app/backend && go run . &
```

## Test suites

| Script | VUs | Duration | Purpose |
|--------|-----|----------|---------|
| `smoke.js` | 1 | 30s | Confirms all endpoints respond — run first |
| `auth.js` | 20–50 | 4m | Login/refresh throughput (bcrypt cost validation) |
| `upload.js` | 5–25 | 3m | Upload pipeline (init → chunk → complete) |
| `stress.js` | 0→300 | 12m | Find the breaking point |
| `soak.js` | 20 | 30m | Detect memory/goroutine leaks over time |

## Run commands

```bash
# Step 1 — smoke test (always run this first)
k6 run tests/load/k6/smoke.js

# Step 2 — auth load
k6 run tests/load/k6/auth.js

# Step 3 — upload pipeline
k6 run tests/load/k6/upload.js

# Step 4 — stress (find breaking point)
k6 run tests/load/k6/stress.js

# Step 5 — soak (leak detection, runs 30 min)
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

## Key metrics to watch

- `login_duration` p95 — should be < 400ms (bcrypt is intentionally slow ~150ms)
- `refresh_duration` p95 — should be < 80ms (JWT verify only)
- `upload_init_duration` p95 — should be < 200ms (DB write + pool lookup)
- `chunk_upload_duration` p95 — should be < 1s (disk write to staging)
- `http_req_failed` — should stay < 1% at normal load
- `upload_failures` — should stay < 5%

## What to watch on the server side

- **Neon CU-hours**: open Neon dashboard → Monitoring. Should flatline (event-driven
  sync_worker means 0 idle DB hits; connections drain after 30s idle).
- **Memory**: watch Railway/Oracle metrics for linear growth (goroutine leak).
- **DB connections**: should never exceed 5 (pgxpool MaxConns=5).
- **Errors in backend logs**: look for `context deadline exceeded` or `connection refused`.
