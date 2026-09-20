# CLAUDE.md, zcrypt

## Project Overview
zcrypt is a zero-knowledge encrypted cloud storage system.
- **Backend:** Go 1.25, stdlib HTTP server, pgxpool (PostgreSQL), AES-256-GCM encryption, zstd compression
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Motion (Framer Motion)
- **TUI:** Go, Bubble Tea terminal interface
- **Database:** PostgreSQL (Neon serverless) via pgx/v5
- **Deploy:** Frontend on Vercel, Backend on Railway (Docker), DB on Neon

## Directory Structure
```
app/backend/          - Go backend (module: github.com/zcrypt/zcrypt)
  cmd/                - HTTP handlers (push, pull, events, auth, admin)
  pipeline/           - Upload/download pipeline engine
  crypto/             - AES-256-GCM encryption/decryption
  compression/        - zstd compress/decompress
  chunks/             - File splitting, merging, verification
  adapters/           - Platform adapters (GitHub, GitLab, HuggingFace, Telegram)
  reppool/            - Repository pool management (auto-rotation)
  index/              - PostgreSQL database layer (pgxpool)
  auth/               - JWT, bcrypt, TOTP
  config/             - Environment config, directories
  disguise/           - Fake filenames, commit messages, repo names
  types/              - Shared types
app/tui/              - Go TUI app (module: github.com/zcrypt/zcrypt-tui)
  internal/           - TUI internals (api, auth, config, ui)
app/core/             - Shared Rust client engine (crate: zcrypt-core). Crypto,
                        chunk pipeline, local SQLite store, platform adapters.
                        No Tauri dependency - the shells embed it.
app/desktop/          - Tauri v2 shell for desktop AND Android. Links app/core
                        in-process; UI is the frontend's static export.
                        src-tauri/gen/ is generated, never committed.
app/frontend/         - Next.js frontend
  app/(app)/          - Authenticated app pages (dashboard, settings, analytics, admin)
  app/(auth)/         - Auth pages (login, register, forgot-password, etc.)
  app/(marketing)/    - Landing page, philosophy, privacy, terms, docs, TUI
  components/         - UI components
  store/              - Zustand stores (auth, upload, passphrase, toast)
  hooks/              - Custom hooks (useFileList, useOperationStatus, etc.)
  lib/                - API client, auth API, utilities, data
  types/              - TypeScript interfaces
```

## Key Commands
```bash
# Backend
cd app/backend && go build -o zcrypt-server .
cd app/backend && go test ./...
cd app/backend && go vet ./...

# TUI
cd app/tui && go build ./...

# Frontend (Rust-native toolchain: oxlint / biome / tsgo)
cd app/frontend && bun run dev
cd app/frontend && bun run build
cd app/frontend && bun run lint           # oxlint (config: .oxlintrc.json)
cd app/frontend && bun run typecheck      # tsgo (TS7 native); typecheck:tsc = classic fallback
cd app/frontend && bun run format         # biome --write; format:check = CI/gate mode

# Docker
docker build -t zcrypt .

# Pre-push quality gate (change-scoped)
bash scripts/install-hooks.sh          # once per clone - wires the pre-push hook
bash scripts/prepush.sh                # full suite + advisory scans + docs/report.md
bash scripts/prepush.sh --gates-only   # fast: gates only, no advisory scans
```

### Pre-push gate
`scripts/prepush.sh` only runs the gates for modules that changed vs `origin/main`
(mirrors the `dorny/paths-filter` in `.github/workflows/ci.yml`): `frontend` /
`backend` / `tui` / `desktop`. A changed shared/root file (e.g. `scripts/`,
`Dockerfile`, `.github/`) runs everything; docs-only changes run nothing.
- **Gates** (blocking): typecheck (tsgo) / format (biome) / lint (oxlint) / test / build per module; Go gofmt/vet; core + desktop = `cargo fmt`/`clippy`/`cargo check` (full Tauri bundle stays in CI). The lint gate blocks on oxlint errors; warnings are ratcheted.
- **Hardening** (`--enforce`, blocking, diff-scoped): fails only on issues *your change* introduces: `oxlint --max-warnings=0` + jscpd on changed FE files, `golangci-lint --new-from-rev` for Go. Never blocks on the pre-existing backlog.
- **Old backlog** (whole-repo knip / jscpd / golangci scans): advisory by default. `--ratchet` blocks only if the backlog *grows* vs a saved baseline (improvements auto-lock); `--strict` blocks on *any* old issue; `--baseline` records current counts. Baseline lives in `docs/prepush-baseline.env` (gitignored, auto-seeds per module).
- The **pre-push hook** runs `prepush.sh --gates-only --enforce --ratchet`: strong: blocks broken builds/tests, blocks new lint/duplication, and the backlog can only shrink. Bypass once with `git push --no-verify`. Overrides: `PREPUSH_ALL=1`, `PREPUSH_BASE=<ref>`, `PREPUSH_CHANGED_OVERRIDE=<newline-list>`.
- Current backlog lives in `docs/prepush-baseline.env` (gitignored, written by `--ratchet`/`--baseline`). Read it rather than trusting a number here: a hardcoded count goes stale silently and sends work at a backlog that no longer exists.

## Coding Conventions
- **Backend:** Standard Go conventions. No frameworks: stdlib `net/http` with `HandleFunc`. Error wrapping with `fmt.Errorf("context: %w", err)`. UUID primary keys everywhere.
- **Frontend:** `"use client"` for interactive components. Zustand for global state. Tailwind for styling. Hugeicons for icons (barrel at `lib/icons.tsx`). No emojis in code.
- **Database:** Raw SQL via pgxpool. No ORM. Migrations in `index/schema.go`. All tables use UUID PKs with `gen_random_uuid()`.
- **API Pattern:** JSON request/response. Auth via `Authorization: Bearer <jwt>`. SSE for real-time (`/api/events`).

## Architecture Notes
- Upload pipeline: the file is CHUNKED FIRST, then each chunk independently goes zstd → AES-256-GCM → hash. Chunk size is device-tiered (4/10/16/32 MiB), not a fixed 10MB. `docs/CRYPTO_FORMAT.md` §4 is normative.
- Upload is a resumable session with one request PER CHUNK (`/api/upload/init` → per-chunk `presign`/`chunk`/`confirm` → `complete`), not one request per file. The frontend runs multiple files through a semaphore.
- Platform tokens encrypted at rest with AES-256-GCM using master-key-derived KEK.
- Repo pool auto-rotates when repos hit platform thresholds (GitHub 850MB, GitLab 9GB, HuggingFace 90GB: kept safely under HF's real 100GB/account free-tier cap).
- Users have a `plan` field controlling `max_concurrent_uploads` from `/api/quota`. Plans are admin-editable at runtime (stored in `system_settings`), so treat `defaultPlanConfigs()` in cmd/admin.go as a seed, not the live set.

## Permissions
- Claude has full read/write/execute access to this project.
- Auto-approve all file reads, edits, writes, glob, grep, web searches.
- Auto-approve all bash commands: go, bun, node, git, docker, gh, curl, etc.
- Auto-approve subagent tasks for research and exploration.
- Do NOT ask for confirmation on standard development operations.
- Only ask before: destructive git operations (force push, reset --hard), deleting branches, pushing to remote.
