.PHONY: dev dev-backend dev-frontend dev-tui \
       build build-backend build-frontend build-tui \
       test test-backend test-frontend test-tui \
       test-integration test-e2e test-load test-all \
       test-load-smoke test-load-auth test-load-upload test-load-stress test-load-soak \
       coverage coverage-backend coverage-frontend \
       lint lint-backend lint-frontend vet-tui \
       security security-go security-frontend \
       clean install install-test-deps \
       db-test-up db-test-down

# ── Development ──────────────────────────────────────────────────────────────

dev: dev-backend dev-frontend

dev-backend:
	cd app/backend && go run .

dev-frontend:
	cd app/frontend && bun run dev

dev-tui:
	cd app/tui && go run .

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-backend build-frontend build-tui

build-backend:
	cd app/backend && go build -o ../../dist/zcrypt-server .

build-frontend:
	cd app/frontend && bun run build

build-tui:
	cd app/tui && CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=dev" -o ../../dist/zcrypt .

# ── Unit Tests ────────────────────────────────────────────────────────────────

test: test-backend test-frontend test-tui

test-backend:
	cd app/backend && go test -race ./...

test-frontend:
	cd app/frontend && bun run test

test-tui:
	cd app/tui && go test ./...

# ── Integration Tests ─────────────────────────────────────────────────────────
# Supports two modes:
#   1. With Docker (default): spins up a throwaway Postgres on :5433
#   2. Without Docker: set TEST_DATABASE_URL to any Postgres URL and run directly
#
# No Docker? Use your Neon test branch:
#   TEST_DATABASE_URL="postgres://..." make test-integration-nodb

test-integration:
	@which docker > /dev/null 2>&1 || \
		(echo "" && \
		 echo "  Docker not found. Two options:" && \
		 echo "" && \
		 echo "  Option A — Install Docker Desktop:" && \
		 echo "    https://www.docker.com/products/docker-desktop/" && \
		 echo "" && \
		 echo "  Option B — Use Neon (no Docker needed):" && \
		 echo "    Create a test branch on neon.tech, then:" && \
		 echo "    TEST_DATABASE_URL='postgres://...' make test-integration-nodb" && \
		 echo "" && \
		 exit 1)
	@$(MAKE) db-test-up
	@echo "Running integration tests against test DB..."
	cd app/backend && TEST_DATABASE_URL="postgres://zcrypt:testpassword@localhost:5433/zcrypt_test" \
		go test -tags=integration -v -timeout=120s ./integration/...
	@$(MAKE) db-test-down

# Run integration tests against any existing Postgres — no Docker required.
# Usage: TEST_DATABASE_URL="postgres://user:pass@host/db" make test-integration-nodb
test-integration-nodb:
	@test -n "$(TEST_DATABASE_URL)" || \
		(echo "ERROR: TEST_DATABASE_URL is not set." && \
		 echo "  Example: TEST_DATABASE_URL='postgres://zcrypt:pass@localhost/zcrypt_test' make test-integration-nodb" && \
		 exit 1)
	@echo "Running integration tests against: $(TEST_DATABASE_URL)"
	cd app/backend && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" \
		go test -tags=integration -v -timeout=120s ./integration/...

# ── E2E Tests (Playwright — requires running dev stack) ───────────────────────

test-e2e:
	@echo "Running Playwright E2E tests..."
	@echo "Make sure backend (port 8080) and frontend (port 3000) are running."
	cd tests/e2e && bun x playwright test

test-e2e-headed:
	cd tests/e2e && bun x playwright test --headed

test-e2e-debug:
	cd tests/e2e && bun x playwright test --debug

test-e2e-report:
	cd tests/e2e && bun x playwright show-report

# ── Load Tests (k6 — requires running backend) ────────────────────────────────

test-load-smoke:
	@echo "Running smoke test (1 VU, 30s)..."
	@curl -sf http://localhost:8080/api/health > /dev/null 2>&1 || \
		(echo "" && \
		 echo "  ERROR: Backend is not running on :8080" && \
		 echo "" && \
		 echo "  Start it first:" && \
		 echo "    cd app/backend && go run ." && \
		 echo "" && \
		 exit 1)
	k6 run tests/load/k6/smoke.js

test-load-auth:
	@echo "Running auth load test (50 VUs, 4 min)..."
	@curl -sf http://localhost:8080/api/health > /dev/null 2>&1 || (echo "ERROR: Backend not running on :8080 — run: cd app/backend && go run ." && exit 1)
	k6 run tests/load/k6/auth.js

test-load-upload:
	@echo "Running upload pipeline load test..."
	@curl -sf http://localhost:8080/api/health > /dev/null 2>&1 || (echo "ERROR: Backend not running on :8080 — run: cd app/backend && go run ." && exit 1)
	k6 run tests/load/k6/upload.js

test-load-stress:
	@echo "Running stress test (ramp to 300 VUs)..."
	@echo "WARNING: This generates significant load. Use on staging only."
	@curl -sf http://localhost:8080/api/health > /dev/null 2>&1 || (echo "ERROR: Backend not running on :8080 — run: cd app/backend && go run ." && exit 1)
	k6 run tests/load/k6/stress.js

test-load-soak:
	@echo "Running soak test (30 min, looking for memory/goroutine leaks)..."
	@curl -sf http://localhost:8080/api/health > /dev/null 2>&1 || (echo "ERROR: Backend not running on :8080 — run: cd app/backend && go run ." && exit 1)
	k6 run tests/load/k6/soak.js

test-load: test-load-smoke test-load-auth test-load-upload

# Against staging
test-load-staging:
	@test -n "$(K6_BASE_URL)" || (echo "ERROR: set K6_BASE_URL=https://your-backend.up.railway.app" && exit 1)
	k6 run --env K6_BASE_URL=$(K6_BASE_URL) tests/load/k6/smoke.js
	k6 run --env K6_BASE_URL=$(K6_BASE_URL) tests/load/k6/auth.js
	k6 run --env K6_BASE_URL=$(K6_BASE_URL) tests/load/k6/upload.js

# ── Full Suite ────────────────────────────────────────────────────────────────

test-all: test test-integration test-e2e

# ── Coverage ─────────────────────────────────────────────────────────────────

coverage-backend:
	cd app/backend && go test ./... -coverprofile=coverage.out -covermode=atomic
	cd app/backend && go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: app/backend/coverage.html"
	open app/backend/coverage.html

coverage-frontend:
	cd app/frontend && bun run test -- --coverage --reporter=html
	@echo "Coverage report: app/frontend/coverage/index.html"
	open app/frontend/coverage/index.html

coverage: coverage-backend coverage-frontend

# ── Security Scanning ─────────────────────────────────────────────────────────

security-go:
	@which govulncheck > /dev/null || go install golang.org/x/vuln/cmd/govulncheck@latest
	cd app/backend && govulncheck ./...
	cd app/tui && govulncheck ./...
	@which gosec > /dev/null || go install github.com/securego/gosec/v2/cmd/gosec@latest
	cd app/backend && gosec ./...

security-frontend:
	cd app/frontend && bun audit

security: security-go security-frontend

# ── Lint ─────────────────────────────────────────────────────────────────────

lint: lint-backend lint-frontend vet-tui

lint-backend:
	cd app/backend && go vet ./...

lint-frontend:
	cd app/frontend && bun run lint

vet-tui:
	cd app/tui && go vet ./...

# ── Test Database ─────────────────────────────────────────────────────────────

db-test-up:
	docker compose -f docker-compose.test.yml up -d --wait

db-test-down:
	docker compose -f docker-compose.test.yml down

db-test-reset:
	docker compose -f docker-compose.test.yml down -v
	docker compose -f docker-compose.test.yml up -d --wait

# ── Install ───────────────────────────────────────────────────────────────────

install:
	cd app/backend && go mod download
	cd app/tui && go mod download
	cd app/frontend && bun install

install-test-deps:
	@which k6 > /dev/null || (echo "Installing k6..." && brew install k6)
	@which docker > /dev/null || echo "WARNING: Docker not found — integration tests require Docker"
	cd tests/e2e && bun install
	cd tests/e2e && bun x playwright install chromium
	@echo "Test dependencies installed."

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	rm -rf dist/
	rm -rf app/frontend/.next
	rm -rf app/frontend/out
	rm -rf app/frontend/coverage
	rm -rf app/backend/coverage.out app/backend/coverage.html
	rm -rf tests/e2e/playwright-report tests/e2e/test-results
