# Contributing to zcrypt

Thanks for your interest in contributing to zcrypt! This document explains how to
set up the project, the conventions we follow, and how to submit changes.

zcrypt is a zero-knowledge encrypted cloud storage system. Because it is a
security/cryptography product, please read [SECURITY.md](./docs/SECURITY.md) before
reporting anything that might be a vulnerability — **do not open a public issue
for security problems.**

## Prerequisites

- Go 1.25+
- Node.js 20+ and [Bun](https://bun.sh)
- PostgreSQL (or a free [Neon](https://neon.tech) database)
- Docker (optional)

## Project layout

```
app/backend/    Go backend (module: github.com/zcrypt/zcrypt)
app/frontend/   Next.js 16 / React 19 frontend
app/tui/        Go Bubble Tea terminal client (module: github.com/zcrypt/zcrypt-tui)
```

## Local setup

### Backend

```bash
cd app/backend

# Create your own environment file from the template, then fill in real values.
cp .env.example .env
# At minimum set DATABASE_URL, MASTER_KEY, and ZCRYPT_JWT_SECRET.
# Generate keys with: openssl rand -hex 32

go build -o zcrypt-server .
go test ./...
go vet ./...

./zcrypt-server
```

### Frontend

```bash
cd app/frontend

bun install
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

bun run dev        # dev server
bun run build      # production build
bun run lint       # lint
bun run typecheck  # type check
```

### TUI

```bash
cd app/tui
go build ./...
```

## Environment variables

Never commit a real `.env`; it is gitignored. The backend template lives at
[`app/backend/.env.example`](./app/backend/.env.example) — copy it to `.env` and
supply your own values. Each contributor is responsible for their own
credentials. If you accidentally commit a secret, rotate it immediately and let
a maintainer know.

## Coding conventions

- **Backend:** Standard Go. stdlib `net/http` (no web framework). Wrap errors
  with `fmt.Errorf("context: %w", err)`. UUID primary keys. Raw SQL via pgxpool
  (no ORM). Run `go vet ./...` and `go test ./...` before pushing.
- **Frontend:** TypeScript + React 19. `"use client"` for interactive
  components. Zustand for global state, Tailwind for styling, Hugeicons for
  icons. No emojis in code. Run `bun run lint` and `bun run typecheck` before
  pushing.
- **Commits:** Keep them focused and write clear messages.

## Quality gate

Before pushing, run the change-scoped quality gate. It runs typecheck, lint,
tests, and build for whichever modules you touched (frontend / backend / tui /
desktop), mirroring CI:

```bash
bash scripts/install-hooks.sh          # once per clone — wires the pre-push hook
bash scripts/prepush.sh --gates-only   # fast: gates only
bash scripts/prepush.sh                # full: gates + advisory backlog scans -> docs/report.md
```

Once installed, the pre-push hook runs the gates automatically on `git push`;
bypass a single push with `git push --no-verify` if you must.

## Branch and PR conventions

1. Fork the repository (or create a feature branch if you have write access).
   Do not commit directly to `main`.
2. Use a descriptive branch name, e.g. `feat/repo-rotation`,
   `fix/cors-whitelist`, or `docs/readme`.
3. Make your change with tests where it makes sense, and ensure the build, lint,
   type check, and tests pass.
4. Open a pull request against `main` with a clear description of what changed
   and why. Link any related issue.
5. A maintainer will review. Address feedback by pushing additional commits to
   the same branch.

## License

By contributing to zcrypt, you agree that your contributions will be licensed
under the [MIT License](./LICENSE), the same license that covers the project.
