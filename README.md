# zstash

Zero-knowledge encrypted cloud storage that hides your files inside disguised git repositories on GitHub, GitLab, HuggingFace, and Telegram.

Your files are compressed, encrypted, chunked, and pushed as LFS objects to private repos that look like ordinary developer repositories. The server never sees your passphrase. The platform never sees your plaintext data.

## How It Works

```
File  -->  zstd compress  -->  AES-256-GCM encrypt  -->  10MB chunks  -->  Git LFS upload
                                    ^
                            PBKDF2-SHA256 key
                           (600K iterations, user passphrase)
```

**Upload pipeline (two-phase):**
1. **Prepare** (local, synchronous) - Validate, compress with zstd, encrypt with AES-256-GCM, split into 10MB chunks
2. **Upload** (network, async, resumable) - Push chunks via Git LFS to platform repos, batch commit, update DB

**Download pipeline:**
1. Fetch chunks concurrently (5 parallel) from platform repos
2. Verify SHA-256 integrity per chunk
3. Reassemble, decrypt (user provides passphrase), decompress
4. Verify final file hash matches original

**Repo disguise:**
- Repos named like `utils-core-v1`, `config-helpers-v2`
- Commits say `chore: clean up build cache`, `fix: resolve loader edge case`
- Files named `a3f8c1d2e9b047a1.bin`
- Auto-generated README with generic developer boilerplate

## Architecture

```
Frontend (Next.js 16 / Vercel)         Backend (Go / Railway)           Storage
+--------------------------+           +------------------------+       +----------------+
|  React 19 + Tailwind     |  <---->   |  stdlib net/http       | ----> | GitHub (850MB) |
|  Zustand state mgmt      |  JSON/SSE |  AES-256-GCM crypto    | ----> | GitLab (9GB)   |
|  XHR upload + progress   |           |  zstd compression      | ----> | HuggingFace    |
|  Passphrase never leaves |           |  pgxpool (Neon PG)     |       |   (280GB/repo) |
|    the client            |           |  JWT + bcrypt + TOTP   | ----> | Telegram       |
+--------------------------+           +------------------------+       +----------------+
                                              |
                                       +------+------+
                                       | PostgreSQL  |
                                       | (Neon)      |
                                       +-------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand 5, motion 12 |
| Backend | Go 1.25, stdlib `net/http`, pgxpool (PostgreSQL) |
| Database | PostgreSQL on Neon (serverless) |
| Encryption | AES-256-GCM, PBKDF2-SHA256 (600K iterations), HKDF for per-user KEK |
| Compression | zstd via `github.com/klauspost/compress` |
| Auth | JWT (HS256) + bcrypt + TOTP 2FA |
| Deploy | Frontend on Vercel, Backend on Railway (Docker), DB on Neon |

## Features

- **Zero-knowledge encryption** - passphrase never leaves the browser, server can't read your files
- **Multi-platform storage** - GitHub, GitLab, HuggingFace, Telegram as storage backends
- **Repo auto-rotation** - new repos created automatically when size thresholds are hit
- **Resumable uploads** - two-phase pipeline survives server restarts
- **Concurrent uploads** - semaphore-based parallel chunk uploading with progress via SSE
- **Repository disguise** - repos look like normal dev projects (fake names, commits, READMEs)
- **Platform token encryption at rest** - tokens encrypted with per-user KEK derived from master key via HKDF
- **2FA support** - TOTP-based two-factor authentication
- **Admin panel** - user management, global tokens, quota management, analytics
- **Three file views** - grid, list, and table views with sort/search/pagination
- **Storage quotas** - per-user quotas with free/pro plan support
- **Passphrase caching** - client-side TTL cache (15 min) so you don't re-enter for every download

## Quick Start

### Prerequisites

- Go 1.25+
- Node.js 20+ and [Bun](https://bun.sh)
- PostgreSQL (or a [Neon](https://neon.tech) account)
- Docker (optional)

### Backend

```bash
cd app/backend

# Copy env template and fill in your values
cp .env .env.local
# Edit .env.local with your DATABASE_URL, MASTER_KEY, etc.

# Generate a master key
openssl rand -hex 32

# Run
go build -o zpush-server . && ./zpush-server
```

### Frontend

```bash
cd app/frontend

# Install dependencies
bun install

# Set API URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Dev server
bun run dev

# Production build
bun run build
```

### Docker

```bash
docker build -t zpush .
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e MASTER_KEY="$(openssl rand -hex 32)" \
  -e FRONTEND_URL="https://your-frontend.vercel.app" \
  -e ALLOWED_ORIGINS="https://your-frontend.vercel.app" \
  zpush
```

## Environment Variables

### Backend (required)

| Variable | Description |
|----------|------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `MASTER_KEY` | 32-byte hex key for envelope encryption of platform tokens |
| `ZPUSH_JWT_SECRET` | JWT signing secret (auto-generated if empty) |
| `FRONTEND_URL` | Frontend URL for email links |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist (defaults to localhost) |

### Backend (optional)

| Variable | Description |
|----------|------------|
| `ZPUSH_PORT` | Server port (default: 8080) |
| `SMTP_HOST` | SMTP server for email verification |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USERNAME` | SMTP login |
| `SMTP_PASSWORD` | SMTP password |
| `SMTP_FROM` | Sender email address |

### Frontend

| Variable | Description |
|----------|------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |

## Project Structure

```
app/backend/
  main.go              - HTTP server, routing, middleware
  cmd/                 - HTTP handlers (auth, push, pull, admin, events, platforms)
  pipeline/            - Upload/download pipeline engine
  crypto/              - AES-256-GCM encryption, PBKDF2 key derivation, HKDF
  compression/         - zstd compress/decompress
  chunks/              - File splitting, merging, SHA-256 verification
  adapters/            - Platform adapters (GitHub, GitLab, HuggingFace, Telegram)
  reppool/             - Repository pool management with auto-rotation
  index/               - PostgreSQL database layer (pgxpool, raw SQL)
  auth/                - JWT, bcrypt, TOTP, email sending
  config/              - Environment config, directory management
  disguise/            - Fake repo names, commit messages, filenames
  types/               - Shared types

app/frontend/
  app/(app)/           - Authenticated app pages (dashboard, settings, analytics, admin)
  app/(auth)/          - Auth pages (login, register, 2FA, forgot-password)
  app/(marketing)/     - Landing page, philosophy
  components/          - UI components (upload, files, auth, admin, settings, ui)
  store/               - Zustand stores (auth, upload, files, passphrase, toast, platform)
  hooks/               - Custom hooks (useFileList, useOperationStatus, usePlatformHealth)
  lib/                 - API client, auth API, utilities
  types/               - TypeScript interfaces
```

## Security

### Encryption Design

- **File encryption:** AES-256-GCM with unique salt (32 bytes) and IV (12 bytes) per file
- **Key derivation:** PBKDF2-SHA256, 600,000 iterations (OWASP 2023 recommendation)
- **Platform token encryption:** AES-256-GCM with per-user KEK derived via HKDF-SHA256 from master key
- **Password storage:** bcrypt (cost 10)
- **Passphrase handling:** Never stored, never logged, never sent to storage platforms

### Server Security

- **CORS whitelist** - only configured origins accepted (no wildcard)
- **JWT algorithm validation** - rejects non-HS256 tokens (prevents algorithm confusion attacks)
- **Auth rate limiting** - 5 attempts per 5 minutes per IP on login/register
- **Global rate limiting** - 50 req/sec per IP with X-Forwarded-For support
- **Password complexity** - min 8 chars, uppercase, digit, special character required
- **Input validation** - filename path traversal protection, Content-Disposition header sanitization
- **Error sanitization** - internal errors logged server-side only, safe messages returned to clients
- **Security headers** - HSTS, X-Frame-Options DENY, nosniff, strict Referrer-Policy, Permissions-Policy

### What the Server Cannot Do

- Read your files (encrypted with your passphrase, which never reaches the server)
- Recover your passphrase (PBKDF2 is one-way)
- Access platform repos without your token (tokens encrypted at rest with master key)

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT or 2FA challenge) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| POST | `/api/auth/verify-email` | Verify email |
| POST | `/api/auth/2fa/setup` | Generate TOTP secret |
| POST | `/api/auth/2fa/enable` | Enable 2FA |
| POST | `/api/auth/2fa/verify` | Verify 2FA code during login |
| GET | `/api/auth/me` | Get current user |

### Files
| Method | Endpoint | Description |
|--------|----------|------------|
| POST | `/api/push` | Upload file (multipart) |
| POST | `/api/pull` | Download file |
| GET | `/api/files` | List files |
| DELETE | `/api/files/{id}` | Delete file |

### Platforms
| Method | Endpoint | Description |
|--------|----------|------------|
| GET | `/api/platforms/status` | Platform connection status |
| POST | `/api/platforms/connect` | Connect platform token |
| DELETE | `/api/platforms/disconnect` | Disconnect platform |
| GET | `/api/repos` | List repos |

### Upload Control
| Method | Endpoint | Description |
|--------|----------|------------|
| POST | `/api/upload/pause` | Pause active upload |
| POST | `/api/upload/resume` | Resume paused upload |
| GET | `/api/uploads/incomplete` | List incomplete uploads |
| GET | `/api/events` | SSE progress stream |

### Admin
| Method | Endpoint | Description |
|--------|----------|------------|
| GET | `/api/admin/users` | List all users |
| PUT | `/api/admin/users/{id}/role` | Set user role |
| PUT | `/api/admin/users/{id}/plan` | Set user plan |
| PUT | `/api/admin/users/{id}/quota` | Set user quota |
| DELETE | `/api/admin/users/{id}` | Delete user |
| GET | `/api/admin/stats` | System statistics |

## Security Hardening Changelog

The following security improvements were implemented as part of a comprehensive audit:

### Phase 0 - Emergency Fixes
- [x] Rotated all leaked secrets (DB password, master key, JWT secret, SMTP password)
- [x] Replaced committed `.env` with safe template (no real credentials)
- [x] Fixed CORS from wildcard `*` to whitelist-based origin validation via `ALLOWED_ORIGINS`
- [x] Added JWT algorithm validation (rejects non-HS256, prevents algorithm confusion attacks)

### Phase 1 - Security Hardening
- [x] Added password complexity requirements (8+ chars, uppercase, digit, special)
- [x] Added auth-specific rate limiting (5 attempts / 5 min per IP on login + register)
- [x] Fixed global rate limiter to use `X-Forwarded-For` / `X-Real-IP` behind reverse proxy
- [x] Added filename validation in pull handler (rejects path traversal `..`, `/`, `\`, null bytes)
- [x] Sanitized `Content-Disposition` header (escapes quotes to prevent header injection)
- [x] Added security headers in Next.js (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
- [x] Sanitized error responses (internal errors logged server-side, safe messages to clients)
- [x] Added structured audit logging for auth events (login success/failure with IP)

### Planned
- [ ] Backend unit test suite (crypto, auth, chunks, pipeline)
- [ ] Frontend test suite (vitest + testing-library)
- [ ] Database transactions for atomic operations
- [ ] React error boundaries
- [ ] SSE reconnection with exponential backoff
- [ ] Upload retry with backoff
- [ ] Structured JSON logging
- [ ] Prometheus metrics
- [ ] API documentation (OpenAPI spec)
- [ ] E2E tests (Playwright)

## Commands

```bash
# Backend
cd app/backend && go build -o zpush-server .     # Build
cd app/backend && go test ./...                   # Test
cd app/backend && go vet ./...                    # Lint

# Frontend
cd app/frontend && bun run dev                    # Dev server
cd app/frontend && bun run build                  # Production build
cd app/frontend && bun run lint                   # Lint
cd app/frontend && bunx tsc --noEmit              # Type check

# Docker
docker build -t zpush .
```

## License

Private - All rights reserved.
