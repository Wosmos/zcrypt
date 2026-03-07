.PHONY: dev dev-backend dev-frontend build build-backend build-frontend test lint clean install

# Development
dev: dev-backend dev-frontend

dev-backend:
	cd app/backend && go run .

dev-frontend:
	cd app/frontend && npm run dev

# Build
build: build-backend build-frontend

build-backend:
	cd app/backend && go build -o ../../dist/zpush-server .

build-frontend:
	cd app/frontend && npm run build

# Test
test:
	cd app/backend && go test ./...

# Lint
lint:
	cd app/backend && go vet ./...
	cd app/frontend && npm run lint

# Clean
clean:
	rm -rf dist/
	rm -rf app/frontend/.next
	rm -rf app/frontend/out

# Install dependencies
install:
	cd app/backend && go mod download
	cd app/frontend && npm install
