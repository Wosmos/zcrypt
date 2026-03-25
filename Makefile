.PHONY: dev dev-backend dev-frontend dev-tui \
       build build-backend build-frontend build-tui \
       test test-backend test-tui \
       lint lint-backend lint-frontend vet-tui \
       clean install

# Development
dev: dev-backend dev-frontend

dev-backend:
	cd app/backend && go run .

dev-frontend:
	cd app/frontend && bun run dev

dev-tui:
	cd app/tui && go run .

# Build
build: build-backend build-frontend build-tui

build-backend:
	cd app/backend && go build -o ../../dist/zcrypt-server .

build-frontend:
	cd app/frontend && bun run build

build-tui:
	cd app/tui && CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=dev" -o ../../dist/zcrypt .

# Test
test: test-backend test-tui

test-backend:
	cd app/backend && go test ./...

test-tui:
	cd app/tui && go test ./...

# Lint
lint: lint-backend lint-frontend vet-tui

lint-backend:
	cd app/backend && go vet ./...

lint-frontend:
	cd app/frontend && bun run lint

vet-tui:
	cd app/tui && go vet ./...

# Clean
clean:
	rm -rf dist/
	rm -rf app/frontend/.next
	rm -rf app/frontend/out

# Install dependencies
install:
	cd app/backend && go mod download
	cd app/tui && go mod download
	cd app/frontend && bun install
