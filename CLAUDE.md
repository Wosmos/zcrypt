# CLAUDE.md — zpush/zstash

## Project Overview
zpush (zstash) is a zero-knowledge encrypted cloud storage system.
- **Backend:** Go 1.25, stdlib HTTP server, pgxpool (PostgreSQL), AES-256-GCM encryption, zstd compression
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, Motion (Framer Motion)
- **Database:** PostgreSQL (Neon serverless) via pgx/v5
- **Deploy:** Frontend on Vercel, Backend on Railway (Docker), DB on Neon

## Directory Structure
```
app/backend/          — Go backend (module: github.com/zpush/zpush)
  cmd/                — HTTP handlers (push, pull, events, auth, admin)
  pipeline/           — Upload/download pipeline engine
  crypto/             — AES-256-GCM encryption/decryption
  compression/        — zstd compress/decompress
  chunks/             — File splitting, merging, verification
  adapters/           — Platform adapters (GitHub, GitLab, HuggingFace, Telegram)
  reppool/            — Repository pool management (auto-rotation)
  index/              — PostgreSQL database layer (pgxpool)
  auth/               — JWT, bcrypt, TOTP
  config/             — Environment config, directories
  disguise/           — Fake filenames, commit messages, repo names
  types/              — Shared types
app/frontend/         — Next.js frontend
  app/(app)/          — Authenticated app pages (dashboard, settings, analytics, admin)
  app/(auth)/         — Auth pages (login, register, forgot-password, etc.)
  components/         — UI components
  store/              — Zustand stores (auth, upload, passphrase, toast)
  hooks/              — Custom hooks (useFileList, useOperationStatus, etc.)
  lib/                — API client, auth API, utilities
  types/              — TypeScript interfaces
```

## Key Commands
```bash
# Backend
cd app/backend && go build -o zpush-server .
cd app/backend && go test ./...
cd app/backend && go vet ./...

# Frontend
cd app/frontend && npm run dev
cd app/frontend && npm run build
cd app/frontend && npx next lint
cd app/frontend && npx tsc --noEmit

# Docker
docker build -t zpush .
```

## Coding Conventions
- **Backend:** Standard Go conventions. No frameworks — stdlib `net/http` with `HandleFunc`. Error wrapping with `fmt.Errorf("context: %w", err)`. UUID primary keys everywhere.
- **Frontend:** `"use client"` for interactive components. Zustand for global state. Tailwind for styling. Lucide for icons. No emojis in code.
- **Database:** Raw SQL via pgxpool. No ORM. Migrations in `index/schema.go`. All tables use UUID PKs with `gen_random_uuid()`.
- **API Pattern:** JSON request/response. Auth via `Authorization: Bearer <jwt>`. SSE for real-time (`/api/events`).

## Architecture Notes
- Upload pipeline: Validate → Compress (zstd) → Encrypt (AES-256-GCM) → Chunk (10MB) → Upload to git platform
- Files are uploaded 1 per HTTP request. Frontend handles multi-file via semaphore-based parallel uploads.
- Platform tokens encrypted at rest with AES-256-GCM using master-key-derived KEK.
- Repo pool auto-rotates when repos hit platform thresholds (GitHub 850MB, GitLab 9GB, HuggingFace 280GB).
- Users have a `plan` field (free/pro) that controls `max_concurrent_uploads` returned by `/api/quota`.

## Permissions
- Claude has full read/write/execute access to this project.
- Auto-approve all file reads, edits, writes, glob, grep, web searches.
- Auto-approve all bash commands: go, npm, npx, node, git, docker, gh, curl, etc.
- Auto-approve subagent tasks for research and exploration.
- Do NOT ask for confirmation on standard development operations.
- Only ask before: destructive git operations (force push, reset --hard), deleting branches, pushing to remote.
