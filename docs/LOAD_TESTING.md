# zcrypt — Testing & QA Guide

> **Note:** A broad QA guide; parts are aspirational — some k6 scripts and E2E specs it
> references do not exist. For the current, real load tests see
> [`load-tests-README.md`](./load-tests-README.md) and `tests/load/k6/`.

Complete testing strategy covering unit, integration, end-to-end, load, and AI-assisted testing for the zcrypt zero-knowledge encrypted storage system.

---

## Table of Contents

1. [Test Architecture](#test-architecture)
2. [Quick Start](#quick-start)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [End-to-End Tests (Playwright)](#end-to-end-tests)
6. [Load & Performance Tests (k6)](#load--performance-tests)
7. [Security Testing](#security-testing)
8. [AI-Powered Testing Tools](#ai-powered-testing-tools)
9. [SQA Checklist](#sqa-checklist)
10. [Coverage Targets](#coverage-targets)
11. [CI/CD Integration](#cicd-integration)
12. [MCP Connections](#mcp-connections)

---

## Test Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              LOAD TESTS (k6)                 │
                    │   auth · upload · download · SSE · shares    │
                    │         → throughput + latency SLOs          │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │          END-TO-END TESTS (Playwright)       │
                    │   register → login → upload → download       │
                    │   → share → 2FA → platform connect           │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │         INTEGRATION TESTS (Go httptest)      │
                    │   real DB (docker) · full HTTP handlers      │
                    │   auth flows · upload pipeline · quota       │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │              UNIT TESTS                      │
                    │  crypto · auth · pipeline · store · hooks    │
                    └─────────────────────────────────────────────┘
```

### What Each Layer Proves

| Layer | Proves | Speed | Cost |
|---|---|---|---|
| Unit | Logic is correct in isolation | ~2s | Cheapest |
| Integration | Go handlers + real DB work together | ~30s | Medium |
| E2E | Full user journeys work in a browser | ~2–5 min | Expensive |
| Load | Architecture holds under real traffic | 10–30 min | Run on demand |

---

## Quick Start

```bash
# 1. Install test dependencies
make install-test-deps

# 2. Run all unit tests
make test

# 3. Run integration tests (requires Docker)
make test-integration

# 4. Run E2E tests (requires running dev stack)
make test-e2e

# 5. Run load tests (requires running backend)
make test-load

# 6. Run everything
make test-all
```

### Prerequisites

| Tool | Install | Purpose |
|---|---|---|
| Docker | `brew install --cask docker` | Integration test DB |
| k6 | `brew install k6` | Load testing |
| Playwright | `bun x playwright install` | E2E browser automation |
| Go 1.25+ | `brew install go` | Backend tests |
| Bun 1.x | `brew install bun` | Frontend tests |

---

## Unit Tests

### Backend (Go)

```bash
cd app/backend && go test ./...                    # all tests
cd app/backend && go test ./... -race              # with race detector
cd app/backend && go test ./... -cover             # with coverage
cd app/backend && go test ./crypto/... -v          # specific package
```

#### Existing Coverage

| Package | Tests | Status |
|---|---|---|
| `crypto/` | Salt, nonce, key derivation, AES-GCM | ✅ |
| `auth/` | bcrypt, JWT sign/verify, TOTP | ✅ |
| `config/` | Config defaults, validation | ✅ |
| `disguise/` | Fake names, commit messages | ✅ |
| `pipeline/` | SSE progress routing, concurrency | ✅ |

#### Gaps to Fill

- `cmd/` — handler-level logic (covered by integration tests)
- `reppool/` — repo rotation logic
- `chunks/` — chunking math, boundary conditions
- `adapters/` — mock adapter responses
- `index/` — query builder logic

```bash
# Run with coverage HTML report
cd app/backend && go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out -o coverage.html
open coverage.html
```

### Frontend (TypeScript)

```bash
cd app/frontend && bun run test                    # run once
cd app/frontend && bun run test:watch              # watch mode
cd app/frontend && bun run test -- --coverage      # with coverage
```

#### Existing Coverage

| Module | Tests | Status |
|---|---|---|
| `lib/crypto.ts` | AES-256-GCM, PBKDF2, SHA-256 | ✅ |
| `lib/crypto-pipeline.ts` | Multi-chunk pipeline, integrity | ✅ |
| `lib/utils.ts` | Byte formatting, ETA, file types | ✅ |
| `store/passphrase.ts` | Zustand caching, TTL expiry | ✅ |

#### Gaps to Fill

- `store/auth.ts` — token lifecycle, refresh logic
- `store/upload.ts` — upload state machine
- `hooks/useFileList.ts` — polling, pagination
- `lib/api.ts` — request building, error handling
- `components/upload/upload-zone.tsx` — drag-drop, file validation

---

## Integration Tests

Integration tests spin up a real PostgreSQL database via Docker and run the full Go handler stack via `net/http/httptest`.

### Setup

```bash
# Start test database
docker compose -f docker-compose.test.yml up -d

# Run integration tests
cd app/backend && go test ./... -tags=integration

# Stop test database
docker compose -f docker-compose.test.yml down
```

Or in one command:

```bash
make test-integration
```

### What They Test

```
POST /api/auth/register     → DB user creation, email token insert
POST /api/auth/login        → bcrypt verify, JWT issue, audit log
POST /api/auth/refresh      → token version check, new JWT issue
POST /api/upload/init       → file + session creation, quota check
POST /api/upload/chunk      → chunk write, staging file creation
POST /api/upload/complete   → chunk count verify, status update
GET  /api/files             → pagination, filter, ownership
GET  /api/download/chunk    → ownership check, file read
DELETE /api/files/:id       → cascade delete, audit log
POST /api/shares            → share creation, token generation
GET  /api/shares/:token     → public access, expiry check
```

### Test Database

Tests run against a throwaway Postgres instance:

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: zcrypt_test
      POSTGRES_USER: zcrypt
      POSTGRES_PASSWORD: testpassword
    ports:
      - "5433:5432"
```

Set in environment before running:

```bash
export TEST_DATABASE_URL="postgres://zcrypt:testpassword@localhost:5433/zcrypt_test"
```

### Writing Integration Tests

```go
//go:build integration

package integration_test

import (
    "net/http/httptest"
    "testing"

    "github.com/stretchr/testify/require"
    "github.com/zcrypt/zcrypt/cmd"
    "github.com/zcrypt/zcrypt/index"
)

func TestUploadPipeline(t *testing.T) {
    db := setupTestDB(t)
    server := cmd.NewServer(testConfig(db))
    ts := httptest.NewServer(server.Handler())
    defer ts.Close()

    // 1. Register user
    user := registerUser(t, ts.URL)

    // 2. Init upload session
    session := initUpload(t, ts.URL, user.Token, "test.txt", 100)

    // 3. Upload chunk
    uploadChunk(t, ts.URL, user.Token, session.ID, 0, []byte("hello world"))

    // 4. Complete upload
    completeUpload(t, ts.URL, user.Token, session.ID)

    // 5. Verify file appears in list
    files := listFiles(t, ts.URL, user.Token)
    require.Len(t, files, 1)
    require.Equal(t, "test.txt", files[0].OriginalName)
}
```

---

## End-to-End Tests

E2E tests use **Playwright** to drive a real browser against the running dev stack.

### Setup

```bash
# Install Playwright browsers
cd tests/e2e && bun install
bun x playwright install chromium

# Run against local dev stack
make dev &         # start backend + frontend
make test-e2e      # run E2E suite

# Or run specific test
cd tests/e2e && bun x playwright test auth.spec.ts
```

### Test Suites

```
tests/e2e/
├── auth.spec.ts           # Register, login, logout, 2FA, magic link
├── upload.spec.ts         # Upload, progress, completion, file list
├── download.spec.ts       # Download, passphrase prompt, file integrity
├── share.spec.ts          # Create share link, public access, expiry
├── platform.spec.ts       # Connect GitHub/GitLab, token management
└── admin.spec.ts          # Admin user list, quota override
```

### Key Scenarios

#### auth.spec.ts
- [ ] Register with valid email → receives verify email
- [ ] Login → JWT stored, redirected to dashboard
- [ ] Login with 2FA enabled → TOTP prompt appears
- [ ] Invalid password → error message, no token stored
- [ ] Logout → tokens cleared, redirected to login
- [ ] Password reset flow → email → new password → login works

#### upload.spec.ts
- [ ] Drag-and-drop single file → progress bar → appears in file list
- [ ] Upload 3 files simultaneously → all complete
- [ ] Upload 1GB file → chunked correctly, completes
- [ ] Upload duplicate filename → handled gracefully
- [ ] Cancel mid-upload → session cleaned up

#### download.spec.ts
- [ ] Download file → passphrase prompt → correct passphrase → file matches original
- [ ] Wrong passphrase → decryption error shown
- [ ] Download via share link (no auth) → passphrase prompt → file downloads

### Running Specific Tests

```bash
# Run all E2E tests
bun x playwright test

# Run with browser visible (headed)
bun x playwright test --headed

# Debug specific test
bun x playwright test auth.spec.ts --debug

# Generate test report
bun x playwright show-report
```

---

## Load & Performance Tests

Load tests use **k6** to measure throughput, latency, and error rates under realistic and peak traffic conditions.

### Install k6

```bash
brew install k6          # macOS
# or
docker pull grafana/k6   # via Docker
```

### Run Load Tests

```bash
# Quick smoke test (1 VU, 30 seconds)
k6 run tests/load/k6/smoke.js

# Load test (50 VUs, 5 minutes)
k6 run tests/load/k6/load.js

# Stress test (ramp to 200 VUs)
k6 run tests/load/k6/stress.js

# Full scenario suite
make test-load

# With output to Grafana Cloud (optional)
k6 run --out cloud tests/load/k6/load.js
```

### Test Scenarios

#### 1. Auth Endpoints — `auth.js`
Tests login/refresh throughput. These are hit on every page load.

**Target thresholds:**
- p95 response < 200ms
- p99 response < 500ms
- Error rate < 0.1%

#### 2. Upload Pipeline — `upload.js`
Simulates concurrent users uploading files (100KB–10MB).

**Target thresholds:**
- Upload init p95 < 100ms
- Chunk upload p95 < 500ms (per 10MB chunk)
- Complete p95 < 200ms
- Error rate < 0.5%

#### 3. Download — `download.js`
Concurrent downloads of various file sizes.

**Target thresholds:**
- Chunk download p95 < 800ms (per 10MB chunk)
- Error rate < 0.1%

#### 4. File List — `list.js`
Simulates dashboard load with pagination.

**Target thresholds:**
- p95 < 100ms for 100-file lists
- p95 < 300ms for 10,000-file lists

#### 5. SSE Connections — `sse.js`
Stress-tests concurrent EventSource connections.

**Target thresholds:**
- 500 concurrent SSE connections sustained for 2 minutes
- Connection establishment p95 < 300ms

### Architecture Capacity Estimates

Based on the current stack (Railway Go server, Neon serverless):

| Scenario | Expected Capacity | Bottleneck |
|---|---|---|
| Auth requests | ~500 req/s | bcrypt cost (CPU) |
| File list | ~1000 req/s | DB query (Neon cold start) |
| Upload init | ~200 req/s | DB write + staging dir |
| Chunk upload (10MB) | ~50 concurrent | Disk I/O on Railway |
| SSE connections | ~300 concurrent | Go goroutine memory |
| Platform sync | ~20 concurrent | Git API rate limits |

### Reading k6 Results

```
✓ http_req_duration.............: avg=45ms min=12ms med=38ms max=312ms p(90)=88ms p(95)=112ms
✓ http_req_failed................: 0.02%   ✓ 3     ✗ 14997
✓ vus............................: 50      min=50  max=50
✓ iterations....................: 15000   28.5/s
```

**Key metrics to watch:**
- `http_req_duration` p95 — latency SLO
- `http_req_failed` — error rate
- `vus` — virtual users
- `iterations` — total requests / rate

---

## Security Testing

### Static Analysis

```bash
# Go: staticcheck (finds bugs + deprecated API usage)
go install honnef.co/go/tools/cmd/staticcheck@latest
cd app/backend && staticcheck ./...

# Go: gosec (security-focused linting)
go install github.com/securego/gosec/v2/cmd/gosec@latest
cd app/backend && gosec ./...

# Frontend: ESLint security plugin (already in config)
cd app/frontend && bun run lint

# Semgrep (cross-language, OWASP rules)
brew install semgrep
semgrep --config=p/owasp-top-ten .
semgrep --config=p/golang .
semgrep --config=p/react .
```

### Dependency Scanning

```bash
# Go: check for known CVEs
go install golang.org/x/vuln/cmd/govulncheck@latest
cd app/backend && govulncheck ./...
cd app/tui && govulncheck ./...

# Frontend: audit npm dependencies
cd app/frontend && bun audit

# Docker image scanning
docker pull aquasec/trivy
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image zcrypt-server:latest
```

### OWASP ZAP (API Fuzzing)

```bash
# Pull OWASP ZAP
docker pull zaproxy/zap-stable

# Passive scan against running backend
docker run -t zaproxy/zap-stable zap-baseline.py \
  -t http://localhost:8080

# Active scan (generates real traffic)
docker run -t zaproxy/zap-stable zap-full-scan.py \
  -t http://localhost:8080 \
  -r zap-report.html
```

### Manual Penetration Test Checklist

Run these manually or via a script against the staging environment:

```bash
# 1. Auth bypass attempts
curl -X GET http://localhost:8080/api/files              # expect 401
curl -X GET http://localhost:8080/api/admin/users        # expect 401/403

# 2. IDOR test — access another user's file
curl -H "Authorization: Bearer $USER_A_TOKEN" \
  http://localhost:8080/api/download/chunk/USER_B_FILE_ID/0  # expect 404

# 3. Rate limit test
for i in {1..200}; do
  curl -X POST http://localhost:8080/api/auth/login \
    -d '{"email":"a","password":"b"}' -s -o /dev/null -w "%{http_code}\n"
done | sort | uniq -c   # should see 429s after ~100

# 4. Oversized body
dd if=/dev/urandom bs=1M count=2 | \
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    --data-binary @-   # expect 413

# 5. JWT algorithm confusion
# Decode any valid JWT, change "alg" to "none", remove signature
# expect 401

# 6. Path traversal
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/download/chunk/../../../etc/passwd/0"  # expect 400/404
```

---

## AI-Powered Testing Tools

### 1. TestSprite (AI Test Generation)

TestSprite analyzes your codebase and auto-generates test cases.

```bash
# Install
npm install -g testsprite

# Analyze backend and generate Go tests
cd app/backend
testsprite analyze --lang go --output ./generated_tests/

# Analyze frontend and generate Vitest tests
cd app/frontend
testsprite analyze --lang typescript --framework vitest --output ./__tests__/generated/
```

Website: https://testsprite.com

### 2. Playwright MCP (AI-Driven Browser Automation)

The Playwright MCP server lets Claude Code drive a real browser to test the frontend interactively.

```bash
# Install
npx @playwright/mcp@latest

# Or add to Claude Code project settings (see MCP Connections section)
```

With Playwright MCP active, you can ask Claude Code:
- "Open the upload page and upload a test file, verify it appears in the list"
- "Try logging in with wrong credentials and check the error message"
- "Walk through the full registration → upload → download flow"

### 3. Semgrep AI (Intelligent Code Analysis)

```bash
# Install
brew install semgrep

# Run AI-enhanced SAST scan
semgrep --config auto .

# Zero-knowledge specific rules (custom)
semgrep --config tests/security/semgrep-rules.yml .
```

### 4. govulncheck (Go Vulnerability Database)

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest

# Check backend
cd app/backend && govulncheck ./...

# Check TUI
cd app/tui && govulncheck ./...
```

### 5. AI-Assisted Test Review (Claude Code)

Ask Claude Code directly to:
- "Review all test files and identify missing edge cases"
- "Generate integration tests for the upload pipeline"
- "Write a k6 script for the most critical user flow"
- "Check if the crypto tests cover nonce reuse scenarios"

### 6. Artillery (HTTP Load Testing Alternative)

Artillery is easier to configure for complex HTTP scenarios.

```bash
npm install -g artillery

# Run scenario
artillery run tests/load/artillery/upload-scenario.yml

# Quick test
artillery quick --count 50 --num 10 http://localhost:8080/health
```

---

## SQA Checklist

Use this checklist before every release.

### Pre-Release Gate

#### Functional
- [ ] `make test` passes (all unit tests green)
- [ ] `make test-integration` passes (integration tests green)
- [ ] `make test-e2e` passes (Playwright suite green)
- [ ] `make lint` passes (no vet/typecheck errors)
- [ ] Manual smoke test: register → upload → download → verify file matches

#### Security
- [ ] `govulncheck ./...` — no critical CVEs
- [ ] `gosec ./...` — no high-severity findings
- [ ] `semgrep --config=p/owasp-top-ten .` — no new critical issues
- [ ] `bun audit` — no high-severity frontend CVEs
- [ ] Auth bypass tests pass (see Security Testing section)
- [ ] Rate limiting verified: 429 returned after threshold
- [ ] Admin endpoints return 403 for non-admin users

#### Performance
- [ ] Smoke test (1 VU): all endpoints p95 < 200ms
- [ ] Load test (50 VUs, 5 min): error rate < 0.5%
- [ ] Neon cold start after 5-min idle: first request < 2s
- [ ] 50MB file upload: completes within 60s on 100Mbps

#### Reliability
- [ ] Backend survives 10-min load test without memory growth
- [ ] SSE connections: 100 concurrent, no leaks after 5 min
- [ ] Correct behavior when Neon is temporarily slow (> 1s queries)
- [ ] Upload resume works after simulated network drop

#### Data Integrity
- [ ] Downloaded file SHA-256 matches original (automated in E2E)
- [ ] Cancelled upload leaves no orphaned staging files
- [ ] Bulk delete removes all files and chunks atomically
- [ ] Quota correctly reflects storage after upload/delete cycles

### Per-PR Gate (lighter)

- [ ] Unit tests pass
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] New code has test coverage > 80% for critical paths
- [ ] No new `_ = err` error silencing
- [ ] No new `console.log` with sensitive data

---

## Coverage Targets

| Component | Current | Target | Priority |
|---|---|---|---|
| `crypto/` | ~80% | **95%** | P0 — encryption must be bulletproof |
| `auth/` | ~70% | **90%** | P0 — auth bugs = account takeover |
| `cmd/` (handlers) | ~5% | **70%** | P1 — via integration tests |
| `pipeline/` | ~40% | **75%** | P1 — data loss risk |
| `index/` (queries) | ~0% | **60%** | P1 — via integration tests |
| `reppool/` | ~0% | **60%** | P2 |
| `chunks/` | ~0% | **70%** | P1 — data integrity |
| Frontend `lib/` | ~85% | **90%** | P0 — crypto + API |
| Frontend `store/` | ~30% | **70%** | P1 |
| Frontend `hooks/` | ~0% | **60%** | P2 |

### Measure Coverage

```bash
# Backend: generate HTML coverage report
cd app/backend
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
open coverage.html

# Frontend: coverage with Vitest
cd app/frontend
bun run test -- --coverage --reporter=html
open coverage/index.html
```

---

## CI/CD Integration

### Pipeline Overview

```
Push / PR
    │
    ├─► Unit Tests (always) ────────────► ✅/❌
    │
    ├─► Integration Tests (main + PRs) ─► ✅/❌
    │         └── spins up postgres docker
    │
    ├─► E2E Tests (main only) ──────────► ✅/❌
    │         └── headless playwright
    │
    ├─► Security Scan (main + PRs) ─────► ✅/❌
    │         └── govulncheck + gosec
    │
    └─► Deploy (main only, all pass) ───► Railway + Vercel
```

### Running Load Tests in CI

Load tests are intentionally NOT in the standard CI pipeline — they require a live environment and are slow. Run them:

1. **Before a big release**: `make test-load-staging`
2. **After architecture changes**: manually via k6
3. **Scheduled**: weekly via GitHub Actions cron (optional)

To run load tests against staging:

```bash
K6_BASE_URL=https://NEXT_PUBLIC_API_URL k6 run tests/load/k6/load.js
```

---

## MCP Connections

MCP (Model Context Protocol) servers extend Claude Code with specialized testing capabilities.

### Playwright MCP

Gives Claude Code the ability to control a real browser — use it for interactive E2E testing and debugging.

**Configured in:** `.claude/settings.json`

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "0"
      }
    }
  }
}
```

**Install browsers:**

```bash
npx playwright install chromium
```

**Usage with Claude Code:**

```
# Open Claude Code in the zcrypt project, then:
"Use Playwright to open http://localhost:3000, register a test user,
 upload a file, download it, and confirm the SHA-256 matches."
```

### Database MCP (optional, for query testing)

If you want Claude Code to query the test database directly:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgres://zcrypt:testpassword@localhost:5433/zcrypt_test"]
    }
  }
}
```

---

## Interpreting Failures

### Unit Test Failure
→ Bug in isolated logic. Fix the code, re-run.

### Integration Test Failure
→ Handler or DB interaction broken. Check migrations ran. Check `TEST_DATABASE_URL` is set.

### E2E Test Failure
→ Could be timing (flaky), real regression, or env issue. Run with `--headed` to watch what happens. Run `--debug` to step through.

### Load Test Threshold Failure
→ Architecture under stress. Check:
1. Railway CPU/memory (was it throttled?)
2. Neon connection pool exhaustion (check `pg_stat_activity`)
3. Go heap size (is it growing linearly? goroutine leak?)
4. Adapter rate limits (GitHub 5000 req/hr per token)

### k6 Error Rate > Threshold
→ Check:
1. The specific endpoint failing (use `k6 inspect` for breakdown)
2. Rate limiter triggering early (is the load test IP whitelisted?)
3. JWT expiry during long test runs (add refresh logic to scripts)
