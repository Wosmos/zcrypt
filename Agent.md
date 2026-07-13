# zcrypt — AI Agent Guide

> **Status:** Active development · **Type:** Zero-knowledge encrypted cloud storage (web-first)
>
> Fast orientation for AI agents. [`CLAUDE.md`](./CLAUDE.md) is the deep reference and
> the source of truth; the **code always wins** over any doc. Read this, then read
> `CLAUDE.md` before making architectural changes.

---

## 1. What zcrypt is

A zero-knowledge, end-to-end encrypted cloud storage system. Users' files are
compressed, encrypted, and chunked **in the browser**, then stored as
ordinary-looking objects inside storage accounts the user already owns — GitHub,
GitLab, Hugging Face, and Telegram. The server never sees the passphrase or any
plaintext.

It is a **hosted web service** (not a local-only desktop app): a Next.js frontend
and a Go HTTP backend with a PostgreSQL database. A terminal client (TUI) and a
Tauri desktop app are secondary clients of the same backend.

## 2. Architecture

```
Clients                         Backend (Go / Railway)          Storage
┌─────────────────────────┐     ┌────────────────────────┐      ┌────────────────┐
│ Web app (Next.js/Vercel)│     │ stdlib net/http        │ ───> │ GitHub (850MB) │
│ TUI (Bubble Tea)        │ ──> │ chunk relay + commit   │ ───> │ GitLab (9GB)   │
│ Desktop (Tauri+sidecar) │JSON │ repo pool + rotation   │ ───> │ HuggingFace    │
│                         │ SSE │ token envelope crypto  │      │  (90GB/repo)   │
│ crypto + zstd run HERE  │     │ pgxpool (Neon Postgres)│ ───> │ Telegram       │
└─────────────────────────┘     └────────────────────────┘      └────────────────┘
```

- **File encryption and zstd compression run client-side** (browser Web Crypto /
  `@noble/*` / `@oneidentity/zstd-js`; the sidecar mirrors this for desktop). The
  backend is **I/O-bound** — it relays already-encrypted chunks and commits them to
  storage. Do not move file crypto server-side, and do not parallelize server crypto.
- The backend's `crypto/` package only does **platform-token envelope encryption**
  (HKDF-derived per-user KEK) and TOTP — never file contents.

## 3. Tech stack (current)

| Layer       | Technology                                                          |
| ----------- | ------------------------------------------------------------------ |
| Frontend    | Next.js 16, React 19, TypeScript, Tailwind, Zustand 5, motion 12    |
| Icons       | Hugeicons (barrel at `app/frontend/lib/icons.tsx`)                  |
| Backend     | Go 1.25 (`toolchain go1.25.12`), stdlib `net/http`, pgxpool         |
| Database    | PostgreSQL on Neon; raw SQL, no ORM; UUID PKs (`gen_random_uuid()`) |
| Crypto      | AES-256-GCM, PBKDF2-SHA256 (600k), HKDF per-user KEK, X25519 ECIES  |
| Compression | zstd — client-side in the browser                                   |
| Auth        | JWT (HS256) + bcrypt (cost 12) + TOTP 2FA + magic links + OAuth     |
| Deploy      | Frontend on Vercel, Backend on Railway (Docker), DB on Neon         |

## 4. Directory ownership

```
app/backend/    Go backend (module github.com/zcrypt/zcrypt)
  cmd/          HTTP handlers; routes are registered in cmd/server.go RegisterRoutes
  crypto/       Token envelope encryption + TOTP (NOT file crypto)
  index/        PostgreSQL layer (pgxpool); migrations in index/schema.go
  adapters/     Storage platform adapters (GitHub, GitLab, HuggingFace, Telegram)
  reppool/      Repository pool + auto-rotation
  auth/ config/ disguise/ types/
app/frontend/   Next.js app (see app/(app), app/(auth), app/(marketing))
app/tui/        Terminal client (Go, Bubble Tea; module ...-tui)
app/desktop/    Tauri desktop app; a Go sidecar reuses the pipeline
```

## 5. Upload / download model

- Upload is a **resumable session, one chunk per HTTP request**: `POST /api/upload/init`
  → `presign`/`chunk`/`confirm` per chunk → `complete`. There is **no** `/api/push`
  or `/api/pull`. The frontend drives multi-file parallelism with a semaphore.
- Chunk size is **device-tiered (~4–16 MB, ~10 MB typical)**, not a fixed value.
- Download: `GET /api/files/{id}/meta` then `GET /api/files/{id}/chunks/{idx}`;
  verify per-chunk SHA-256, reassemble, decrypt, decompress — all client-side.
- Repo pool auto-rotates same-platform as repos fill (GitHub 850MB, GitLab 9GB,
  HuggingFace 90GB under the 100GB/account cap). Telegram is the unlimited primary;
  do NOT auto-route large files to HuggingFace.

## 6. Hard constraints

```
SECURITY
[S1] The passphrase never leaves the client — never transmitted, stored, or logged.
[S2] File encryption + compression stay client-side. The server handles only
     already-encrypted chunks.
[S3] Platform tokens are encrypted at rest (AES-256-GCM under a master-key-derived
     KEK). Never log tokens, keys, passphrases, or plaintext — not even at debug.
[S4] Per-file random CEK, wrapped by the passphrase-derived KEK (envelope model).
     Fresh nonces per chunk. AES-256-GCM and PBKDF2-SHA256 (600k) are settled.

ARCHITECTURE
[A1] Backend is stdlib net/http — no web framework. Register routes in
     cmd/server.go `RegisterRoutes`, NOT in main.go.
[A2] Raw SQL via pgxpool — no ORM. UUID PKs. Migrations live in index/schema.go.
[A3] Wrap errors with fmt.Errorf("context: %w", err). No panic in request paths.

CODE QUALITY
[C1] TypeScript: no `any` — use `unknown` + type guards. "use client" only for
     interactive components. Zustand for global state. Hugeicons via lib/icons.tsx.
     No emojis in code. Self-documenting code; comments only for non-obvious logic.
[C2] Run the change-scoped quality gate before pushing:
     bash scripts/prepush.sh --gates-only   (see CLAUDE.md for details)
```

## 7. Session-start checklist

```
□ I read this file and (for architectural work) CLAUDE.md
□ I know file crypto/zstd are client-side and the backend is an I/O relay
□ I will not reintroduce /api/push /api/pull or a fixed chunk size
□ I register backend routes in cmd/server.go RegisterRoutes, not main.go
□ I will not log or persist passphrases, tokens, keys, or plaintext
□ I ran (or will run) scripts/prepush.sh --gates-only for the modules I touched
```

---

_zcrypt AI Agent Guide. When the architecture changes, update this file and
`CLAUDE.md` together so they never disagree._
