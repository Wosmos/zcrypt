# zpush — Agentic AI Instruction Document
> **Version:** 0.1 | **Status:** Pre-development | **Type:** Open Source Desktop App
> 
> This file is the single source of truth for all AI agents working on this project.
> Read this entire file before writing a single line of code, making any architectural decision, or suggesting any change.
> If something is marked IMMUTABLE — do not change it. If something is marked LOCKED — do not suggest alternatives.

---

## TABLE OF CONTENTS

1. [Project Identity](#1-project-identity)
2. [Architecture Overview](#2-architecture-overview)
3. [Agent Roles & Responsibilities](#3-agent-roles--responsibilities)
4. [Skills to Install](#4-skills-to-install)
5. [Frontend — Next.js Agent](#5-frontend--nextjs-agent)
6. [Backend — Go Service Agent](#6-backend--go-service-agent)
7. [Core Pipeline Agent](#7-core-pipeline-agent)
8. [Platform Adapter Agent](#8-platform-adapter-agent)
9. [Hooks & Event System](#9-hooks--event-system)
10. [How Agents Communicate](#10-how-agents-communicate)
11. [File Structure](#11-file-structure)
12. [Hard Constraints](#12-hard-constraints)
13. [Component Naming](#13-component-naming)
14. [MVP Scope](#14-mvp-scope)

---

## 1. PROJECT IDENTITY

```
NAME:        zpush
TYPE:        Cross-platform desktop application
PURPOSE:     Encrypted, compressed, covert personal cloud storage
             using Git platforms and Telegram as free backends
TARGETS:     Windows, macOS, Linux (single codebase)
USERS:       Developers. Open source. Security-conscious.
PHILOSOPHY:  Zero-knowledge. No server. No subscription. No trust required.
```

### What zpush does (one paragraph)
Users push files and folders through a pipeline: zstd compress (level 22) → AES-256-GCM encrypt → 90MB chunk split → upload to GitHub / GitLab / HuggingFace / Telegram repos as disguised build artifacts. Download reverses the pipeline exactly. Every byte reconstructed losslessly. The passphrase never leaves the machine. Servers only ever see encrypted binary blobs with randomized hex filenames.

### What zpush is NOT
- Not a web service. No cloud backend owned by us.
- Not an encryption tool. Encryption is one step in the pipeline, not the product.
- Not a backup tool (though it can be used as one).
- Not Electron. Do not suggest Electron under any circumstances.

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    DESKTOP APPLICATION                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FRONTEND  (Next.js + Tauri)             │   │
│  │   File Browser │ Upload UI │ Progress │ Settings     │   │
│  └────────────────────┬────────────────────────────────┘   │
│                        │  IPC (Tauri invoke / listen)        │
│  ┌─────────────────────▼──────────────────────────────┐    │
│  │              GO BACKEND SERVICE                      │    │
│  │   Pipeline Engine │ Crypto │ Compression │ Chunks   │    │
│  │   Repo Pool Manager │ Local Index (SQLite)          │    │
│  └──────────┬──────────────────────────────────────────┘    │
│             │  HTTP / platform SDKs                          │
│  ┌──────────▼──────────────────────────────────────────┐    │
│  │           PLATFORM ADAPTER LAYER                     │    │
│  │   GitHub │ GitLab │ HuggingFace │ Telegram           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack (LOCKED — do not propose alternatives)

| Layer | Technology | Reason |
|---|---|---|
| Desktop shell | Tauri v2 | Small binary (~8MB), Rust backend, no bundled Chromium |
| Frontend | Next.js 14 + TypeScript | SSG mode inside Tauri, dev already knows this stack |
| UI styling | Tailwind CSS | Utility-first, consistent with dev's existing workflow |
| Backend service | Go 1.22+ | Single binary, goroutines for parallel uploads, best perf |
| IPC layer | Tauri commands + events | Frontend↔Backend bridge inside desktop app |
| Local database | SQLite via go-sqlite3 | File→chunk→platform index, zero config |
| Crypto | Go stdlib crypto/aes + crypto/cipher | No external crypto deps |
| Compression | go-zstd (DataDog binding) | Native zstd level 22, production grade |
| Token storage | System keychain via Tauri keychain plugin | Never plaintext |

---

## 3. AGENT ROLES & RESPONSIBILITIES

Each agent below owns a specific layer. Agents do not cross boundaries without explicit instruction.

---

### AGENT 1 — FRONTEND AGENT
**Owns:** Everything inside `/app/frontend/`
**Stack:** Next.js 14, TypeScript, Tailwind CSS, Tauri JS API
**Does NOT touch:** Go code, crypto logic, platform API calls, SQLite
**Communicates with backend via:** Tauri `invoke()` commands and `listen()` events only

Responsibilities:
- All UI components, pages, layouts
- File drag-and-drop upload zone
- Real-time upload/download progress UI (driven by backend events)
- Platform connection status dashboard
- Repo pool health visualizer
- Settings page (passphrase input, token management UI, thresholds)
- File browser (list stored files, filter, search)
- Zero state / onboarding flow

Rules:
- Never implement crypto, compression, or API calls in frontend code
- All sensitive inputs (passphrase, tokens) are passed directly to backend via IPC — never stored in frontend state longer than the IPC call
- Use Next.js in static export mode (`output: 'export'`) — Tauri does not run a Next.js server
- Use `app/` router, not `pages/` router
- Every Tauri IPC call must have a loading state and an error state in the UI

---

### AGENT 2 — BACKEND SERVICE AGENT
**Owns:** Everything inside `/app/backend/`
**Stack:** Go 1.22+, Tauri Rust bridge, SQLite
**Does NOT touch:** Frontend components, UI logic, styling
**Communicates with frontend via:** Tauri command handlers and emitted events

Responsibilities:
- Expose all Tauri commands consumed by frontend
- Orchestrate the Pipeline Engine on upload/download
- Manage SQLite local index (schema, queries, migrations)
- Manage config file at `~/.zpush/config.json`
- Token storage via system keychain
- Repo Pool Manager logic
- Emit real-time progress events to frontend during operations

Rules:
- All Go code must be idiomatic Go — no unnecessary abstractions
- Every function that can fail must return an error — no panic in production paths
- Goroutines must have proper context cancellation support
- Never log passphrase, tokens, or decrypted data — not even at debug level
- All file operations must be atomic where possible (write to temp, rename)

---

### AGENT 3 — PIPELINE AGENT
**Owns:** `/app/backend/pipeline/`
**Called by:** Backend Service Agent
**Calls:** Crypto Module, Compression Module, Chunk Manager, Platform Adapter

Responsibilities:
- Implement the upload pipeline: compress → encrypt → chunk → upload
- Implement the download pipeline: fetch → reassemble → decrypt → decompress
- Coordinate all modules in correct sequence — sequence is IMMUTABLE (see Section 7)
- Handle pipeline cancellation mid-operation cleanly
- Emit granular progress updates at each stage (percentage, current stage name, bytes processed)
- Verify SHA-256 of each chunk after download before passing to reassembler

Rules:
- Pipeline sequence cannot be reordered under any circumstances
- If any step fails, the pipeline must clean up partial state before returning error
- Progress events must fire at minimum every 250ms during active operations

---

### AGENT 4 — PLATFORM ADAPTER AGENT
**Owns:** `/app/backend/adapters/`
**Called by:** Pipeline Agent and Repo Pool Manager

Responsibilities:
- Implement a unified `PlatformAdapter` interface in Go
- Implement concrete adapters: `GithubAdapter`, `GitlabAdapter`, `HuggingFaceAdapter`, `TelegramAdapter`
- Each adapter implements: `Upload(chunk)`, `Download(chunkID)`, `Delete(chunkID)`, `GetRepoSize(repo)`, `CreateRepo(name)`, `ListChunks(repo)`
- Handle rate limiting and retry logic per platform
- Abstract away all platform-specific API differences behind the unified interface

Rules:
- Frontend never calls platform APIs directly — always through backend → adapter
- Each adapter is independently testable with mock HTTP responses
- Platform API tokens are fetched from keychain inside adapter, never passed as args from frontend
- Adapters must handle partial failures gracefully (one platform down should not kill the whole operation)

---

### AGENT 5 — DEVOPS / TOOLING AGENT
**Owns:** `/.github/`, `/Makefile`, `/scripts/`, `tauri.conf.json`, CI/CD config
**Does NOT touch:** Application code

Responsibilities:
- GitHub Actions CI: lint, test, build on push to main and PRs
- Release pipeline: build binaries for Windows (.msi), macOS (.dmg), Linux (.AppImage + .deb)
- Makefile targets: `make dev`, `make build`, `make test`, `make lint`, `make clean`
- Tauri updater config for auto-updates
- Code signing config placeholders (unsigned for now, structure for future signing)

---

## 4. SKILLS TO INSTALL

Run these before starting development. Agent 5 owns the setup scripts.

### System dependencies
```bash
# Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Go 1.22+
# Download from https://go.dev/dl/ or:
sudo apt install golang-go   # Linux
brew install go              # macOS

# Node.js 20 LTS (for Next.js frontend)
# Use nvm: https://github.com/nvm-sh/nvm
nvm install 20
nvm use 20

# Tauri CLI v2
cargo install tauri-cli --version "^2.0"

# zstd system library (required by go-zstd)
sudo apt install libzstd-dev   # Linux (Debian/Ubuntu)
brew install zstd               # macOS

# SQLite dev headers
sudo apt install libsqlite3-dev  # Linux
# macOS: included in Xcode CLT
```

### Go dependencies (run inside `/app/backend/`)
```bash
go get github.com/DataDog/zstd              # zstd compression
go get github.com/mattn/go-sqlite3          # SQLite driver
go get github.com/google/go-github/v60      # GitHub API client
go get github.com/xanzy/go-gitlab           # GitLab API client
go get github.com/nicholasgasior/gsfmt      # structured logging
go get golang.org/x/crypto                  # additional crypto utilities
```

### Frontend dependencies (run inside `/app/frontend/`)
```bash
npm install
# Key packages already in package.json:
# @tauri-apps/api         — Tauri IPC bridge
# @tauri-apps/plugin-*   — Tauri plugins (keychain, fs, dialog)
# next@14                — Next.js
# tailwindcss            — styling
# lucide-react           — icons
# framer-motion          — animations
# zustand                — client state management
```

### VS Code extensions (recommended, not required)
```
rust-analyzer
golang.go
bradlc.vscode-tailwindcss
esbenp.prettier-vscode
ms-vscode.vscode-typescript-next
tauri-apps.tauri-vscode
```

---

## 5. FRONTEND — NEXT.JS AGENT

### Configuration rules
```
output: 'export'           — static export, no Next.js server inside Tauri
images.unoptimized: true   — required for static export
basePath: ''               — Tauri serves from root
trailingSlash: false
```

### Page structure
```
app/
  layout.tsx              — root layout, global styles, Tauri event listeners init
  page.tsx                — dashboard / home (file list + quick upload)
  upload/
    page.tsx              — dedicated upload page with drag-drop zone
  files/
    page.tsx              — full file browser (search, filter, sort)
  platforms/
    page.tsx              — platform connection status, repo pool health
  settings/
    page.tsx              — tokens, passphrase, thresholds, preferences
  onboarding/
    page.tsx              — first-run setup wizard
```

### State management rules
- Use Zustand for global state (upload queue, platform status, file list)
- Never store passphrase in Zustand or any persistent state
- Platform connection status is fetched from backend on app mount, cached in Zustand
- Upload queue is managed in Zustand — items transition: `queued → compressing → encrypting → uploading → done | failed`

### IPC pattern — how frontend calls backend
```typescript
// Calling a Go backend command
import { invoke } from '@tauri-apps/api/core'

const result = await invoke<FileListResponse>('list_files', {
  filter: searchQuery
})

// Listening to backend progress events
import { listen } from '@tauri-apps/api/event'

const unlisten = await listen<ProgressEvent>('upload_progress', (event) => {
  updateUploadProgress(event.payload)
})

// Always clean up listeners on component unmount
onCleanup(() => unlisten())
```

### Tauri commands frontend must call (Backend Agent implements these)
```typescript
invoke('push_file', { path: string, passphrase: string })
invoke('pull_file', { filename: string, outputDir: string, passphrase: string })
invoke('list_files', { filter?: string })
invoke('delete_file', { filename: string })
invoke('get_platform_status')
invoke('connect_platform', { platform: string, token: string })
invoke('get_repo_pool')
invoke('get_config')
invoke('update_config', { key: string, value: unknown })
```

### Events frontend must listen for (Backend Agent emits these)
```typescript
listen('upload_progress',   { stage: string, percent: number, bytesProcessed: number })
listen('download_progress', { stage: string, percent: number, bytesProcessed: number })
listen('operation_complete',{ filename: string, success: boolean, error?: string })
listen('repo_rotated',      { oldRepo: string, newRepo: string, platform: string })
```

---

## 6. BACKEND — GO SERVICE AGENT

### Package structure
```
backend/
  main.go                   — Tauri entry point, registers all commands
  cmd/
    push.go                 — push command handler
    pull.go                 — pull command handler
    list.go                 — list files handler
    delete.go               — delete handler
    config.go               — config read/write handlers
    platforms.go            — platform connect/status handlers
  pipeline/
    engine.go               — Pipeline Engine (orchestration)
    progress.go             — progress event emitter
  crypto/
    encrypt.go              — AES-256-GCM encrypt
    decrypt.go              — AES-256-GCM decrypt
    keys.go                 — PBKDF2 key derivation
  compression/
    compress.go             — zstd level 22 compress
    decompress.go           — zstd decompress
  chunks/
    split.go                — split into 90MB chunks
    merge.go                — reassemble chunks
    verify.go               — SHA-256 integrity check
  adapters/
    interface.go            — PlatformAdapter interface definition
    github.go               — GitHub implementation
    gitlab.go               — GitLab implementation
    huggingface.go          — HuggingFace implementation
    telegram.go             — Telegram implementation
  reppool/
    manager.go              — Repo Pool Manager
    rotation.go             — auto-rotation logic
  index/
    db.go                   — SQLite connection + migration
    schema.go               — table definitions
    queries.go              — all prepared queries
  config/
    config.go               — read/write ~/.zpush/config.json
    keychain.go             — token storage via system keychain
  types/
    types.go                — all shared structs and interfaces
  disguise/
    names.go                — repo name generator
    commits.go              — commit message generator
    filenames.go            — chunk filename generator (random hex)
```

### How Go communicates with Tauri frontend
```go
// Register a command (in main.go)
app.OnRequest(func(ctx context.Context, req tauri.Request) {
    switch req.Command {
    case "push_file":
        handlePushFile(ctx, req, app)
    }
})

// Emit a progress event to frontend
app.EmitEvent("upload_progress", ProgressEvent{
    Stage:          "encrypting",
    Percent:        45,
    BytesProcessed: 94371840,
})
```

### Go concurrency rules
- Each upload/download operation runs in its own goroutine
- Use `context.Context` for cancellation — every long operation must respect ctx.Done()
- Platform chunk uploads run in parallel with a worker pool (max 4 concurrent per platform)
- SQLite writes are serialized through a single write goroutine (reads can be concurrent)
- Never share mutable state across goroutines without a mutex or channel

---

## 7. CORE PIPELINE AGENT

### Upload sequence (IMMUTABLE — never reorder)
```
1. VALIDATE      Check file exists, passphrase not empty, at least one platform connected
2. COMPRESS      zstd level 22 → temp file at ~/.zpush/tmp/{uuid}.zst
3. ENCRYPT       AES-256-GCM → temp file at ~/.zpush/tmp/{uuid}.enc
                 Payload: [32B salt][12B IV][16B auth tag][ciphertext]
4. CHUNK         Split into 90MB chunks → ~/.zpush/tmp/{uuid}/chunk_{000..999}
5. HASH          SHA-256 each chunk, store hashes in manifest
6. UPLOAD        Push chunks to platform(s) via adapter, parallel workers
7. INDEX         Write file→chunks→repos mapping to SQLite
8. MANIFEST      Commit .zpush-manifest.json to repo alongside chunks
9. CLEANUP       Delete all temp files at ~/.zpush/tmp/{uuid}/
10. EMIT         Send operation_complete event to frontend
```

### Download sequence (IMMUTABLE — never reorder)
```
1. LOOKUP        Query SQLite index for filename → get chunk list + locations
2. FETCH         Download all chunks in parallel from their respective platforms
3. VERIFY        SHA-256 each downloaded chunk against stored hash — abort if mismatch
4. REASSEMBLE    Sort chunks by index, concatenate into single encrypted blob
5. DECRYPT       AES-256-GCM decrypt using passphrase-derived key
6. DECOMPRESS    zstd decompress → original file bytes
7. WRITE         Write to output directory
8. CLEANUP       Delete temp chunks
9. EMIT          Send operation_complete event to frontend
```

### Temp file hygiene rules
- Temp dir: `~/.zpush/tmp/` — created on first run, cleaned on every app start
- Every operation gets a UUID-named subdirectory
- On success: entire subdir deleted immediately after SQLite index updated
- On failure: entire subdir deleted before error is returned
- On crash/restart: entire `~/.zpush/tmp/` is wiped on next app start

---

## 8. PLATFORM ADAPTER AGENT

### Unified interface (Go)
```go
type PlatformAdapter interface {
    Upload(ctx context.Context, chunk Chunk) (ChunkRef, error)
    Download(ctx context.Context, ref ChunkRef) ([]byte, error)
    Delete(ctx context.Context, ref ChunkRef) error
    GetRepoSize(ctx context.Context, repo string) (int64, error)
    CreateRepo(ctx context.Context, name string) (string, error)
    ListChunks(ctx context.Context, repo string) ([]ChunkRef, error)
    PlatformName() string
}
```

### Platform rotation thresholds (LOCKED)
| Platform | Threshold | Hard Limit | Notes |
|---|---|---|---|
| GitLab | 9,000 MB | 10 GB | Primary. Best free tier. |
| GitHub | 850 MB | 1 GB rec | Reliable API. Most familiar. |
| HuggingFace | 280,000 MB | 300 GB | Public repos only on free tier. |
| Telegram | N/A | 2 GB/file | Self-hosted local Bot API required. |

### Repo disguise rules (ALL platforms)
```
Naming pattern:   {adjective}-{noun}-v{n}
Examples:         utils-core-v1, config-helpers-v2, build-cache-v3

Commit messages:  Conventional commit format
Examples:         chore: update cache artifacts
                  refactor: optimize build output
                  fix: update stale references

Chunk filenames:  Random 16-char hex + .bin extension
Example:          a3f8c1d2e9b047a1.bin

README.md:        Each repo gets generic dev project description
                  Never mention zpush or encryption in any repo
```

### Platform fallback waterfall
```
1st choice → GitLab   (10GB repos, private, best free tier)
2nd choice → GitHub   (most reliable API, familiar SDK)
3rd choice → HuggingFace (massive storage, public only)
4th choice → Telegram (fallback for large single files)

If primary platform fails mid-upload:
→ pause, emit warning event to frontend
→ continue remaining chunks on next available platform
→ log which chunks are on which platform in SQLite index
```

---

## 9. HOOKS & EVENT SYSTEM

### Tauri lifecycle hooks

```rust
// src-tauri/src/main.rs

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Hook: app started
            // → create ~/.zpush/ directories if not exist
            // → run SQLite migrations
            // → wipe ~/.zpush/tmp/ (clean up any crash remnants)
            // → load config from ~/.zpush/config.json
            // → verify keychain connectivity
            Ok(())
        })
        .on_window_event(|event| match event.event() {
            // Hook: window close requested
            // → cancel any in-progress operations gracefully
            // → flush SQLite WAL
            // → clean temp files
            tauri::WindowEvent::CloseRequested { .. } => {}
            _ => {}
        })
        .run(tauri::generate_context!())
}
```

### Go-level hooks (implement in backend/pipeline/engine.go)

```go
// BeforeUpload — runs before every push operation
// → validate passphrase is not empty
// → check at least one platform is connected and reachable
// → check disk space for temp files (need ~3x file size free)
// → create temp directory for this operation

// AfterUpload — runs after every successful push
// → update SQLite index
// → commit manifest to repo
// → delete temp files
// → emit operation_complete event

// BeforeDownload — runs before every pull operation
// → validate filename exists in SQLite index
// → validate output directory is writable
// → check disk space (need ~2x encrypted size free)

// AfterDownload — runs after every successful pull
// → verify output file SHA-256 matches original (if hash stored in index)
// → delete temp chunks
// → emit operation_complete event

// OnRepoFull — triggered by Repo Pool Manager
// → generate new repo name (disguise module)
// → create repo via platform adapter
// → add new repo to SQLite pool
// → update config
// → emit repo_rotated event to frontend
// → continue upload on new repo

// OnPlatformError — triggered by any adapter failure
// → log error (without tokens/keys)
// → emit warning event to frontend
// → attempt fallback to next platform in waterfall
// → if all platforms fail → return error, clean up, notify frontend
```

### Frontend hooks (React/Next.js)

```typescript
// useOperationStatus.ts — global hook, mounted at layout level
// Listens to: upload_progress, download_progress, operation_complete, repo_rotated
// Updates Zustand store with current operation state

// useFileList.ts — refetches file list from backend after every operation_complete event

// usePlatformHealth.ts — polls platform status every 60s, updates connection indicators

// useOnboarding.ts — checks on mount if any platform is connected
//                    if none → redirects to onboarding page
```

---

## 10. HOW AGENTS COMMUNICATE

### Communication is strictly one-directional per boundary

```
Frontend Agent
    ↓  invoke() — calls Go command by name, gets typed response
    ↑  listen() — receives typed events emitted by Go

Backend Service Agent
    ↓  calls Pipeline Agent functions directly (same process)
    ↑  receives return values and errors

Pipeline Agent
    ↓  calls Crypto Module, Compression Module, Chunk Manager, Platform Adapter
    ↑  receives results, propagates errors up

Platform Adapter Agent
    ↓  calls external platform HTTP APIs
    ↑  returns normalized responses via unified interface
```

### No agent calls upward
- Platform Adapter does not call Pipeline Agent
- Pipeline Agent does not call Backend Service Agent
- Backend Service Agent does not call Frontend Agent
- Events flow up (backend emits, frontend listens) — commands flow down (frontend invokes, backend handles)

### IPC payload rules
- All IPC payloads are JSON-serializable Go structs / TypeScript interfaces
- Define shared types in `/app/backend/types/types.go` (Go) and `/app/frontend/types/index.ts` (TS)
- Both files must stay in sync — when you change a type in Go, update the TS type immediately
- Passphrase is passed in IPC payload and immediately discarded after key derivation — never stored in any struct field after use

---

## 11. FILE STRUCTURE

```
zpush/
  app/
    frontend/                   — Next.js app (Frontend Agent owns this)
      app/
        layout.tsx
        page.tsx
        upload/page.tsx
        files/page.tsx
        platforms/page.tsx
        settings/page.tsx
        onboarding/page.tsx
      components/
        ui/                     — reusable UI primitives
        upload/                 — upload zone, queue, progress
        files/                  — file browser, file card
        platforms/              — platform status cards, repo pool
        settings/               — token inputs, config forms
      hooks/                    — custom React hooks
      store/                    — Zustand stores
      types/                    — TypeScript interfaces (mirror Go types)
      lib/                      — utilities, IPC wrappers
      next.config.ts
      tailwind.config.ts
      tsconfig.json

    backend/                    — Go service (Backend Agent owns this)
      main.go
      cmd/
      pipeline/
      crypto/
      compression/
      chunks/
      adapters/
      reppool/
      index/
      config/
      types/
      disguise/
      go.mod
      go.sum

  src-tauri/                    — Tauri Rust shell (DevOps Agent owns this)
    src/
      main.rs
      lib.rs
    tauri.conf.json
    Cargo.toml
    icons/

  .github/
    workflows/
      ci.yml                    — lint + test on every PR
      release.yml               — build + publish binaries on tag

  scripts/
    setup.sh                    — installs all system dependencies
    dev.sh                      — starts frontend dev server + backend watcher
    build.sh                    — production build for current platform

  Makefile                      — make dev, make build, make test, make lint, make clean
  README.md                     — user-facing readme (separate from this file)
  AGENTS.md                     — THIS FILE
```

---

## 12. HARD CONSTRAINTS

These are non-negotiable. Any agent violating these must revert and flag for review.

```
SECURITY
────────────────────────────────────────────────────────────────────
[S1]  NEVER store passphrase anywhere — not in memory after key derivation,
      not in logs, not in config, not in SQLite, not in IPC payloads after use.

[S2]  NEVER store API tokens in plaintext — keychain ONLY via Tauri keychain plugin.

[S3]  NEVER push unencrypted data to any platform — encrypt BEFORE any network call.
      Encryption is step 3. It comes after compression. Never reorder.

[S4]  NEVER reuse an IV. Generate fresh 12-byte random IV per file, every time.

[S5]  NEVER log decrypted content, tokens, passphrases, or derived keys.
      Not even at trace/debug level.

[S6]  NEVER skip SHA-256 chunk verification on reassembly (Step 3 of download pipeline).

ARCHITECTURE
────────────────────────────────────────────────────────────────────
[A1]  NEVER add a backend server. No cloud component. No external service we operate.
      zpush is local-first. Entirely.

[A2]  NEVER use Electron. Tauri only.

[A3]  NEVER call platform APIs from the frontend. All platform calls go through
      the Go backend via IPC.

[A4]  NEVER reorder the pipeline steps. Both upload and download sequences are immutable.

[A5]  NEVER use a different encryption algorithm. AES-256-GCM is final.

[A6]  NEVER use a different compression algorithm. zstd level 22 is final.

CODE QUALITY
────────────────────────────────────────────────────────────────────
[C1]  NEVER use 'any' type in TypeScript. Use 'unknown' + type guards.

[C2]  NEVER use panic() in Go production paths. Return errors properly.

[C3]  NEVER add a dependency without stating what it replaces and why it is needed.

[C4]  NEVER leave temp files behind on operation failure. Always clean up in defer.

[C5]  NEVER write to ~/.zpush/ outside of the designated subdirs:
      ~/.zpush/config.json, ~/.zpush/index.db, ~/.zpush/tmp/
```

---

## 13. COMPONENT NAMING

Use these exact names in all code, comments, documentation, and IPC payloads.

| Component Name | Location | Owned By |
|---|---|---|
| `PipelineEngine` | `backend/pipeline/engine.go` | Pipeline Agent |
| `CryptoModule` | `backend/crypto/` | Backend Agent |
| `CompressionModule` | `backend/compression/` | Backend Agent |
| `ChunkManager` | `backend/chunks/` | Backend Agent |
| `PlatformAdapter` | `backend/adapters/interface.go` | Platform Adapter Agent |
| `RepoPoolManager` | `backend/reppool/manager.go` | Backend Agent |
| `LocalIndex` | `backend/index/` | Backend Agent |
| `DisguiseModule` | `backend/disguise/` | Backend Agent |
| `UploadQueue` | `frontend/store/uploadQueue.ts` | Frontend Agent |
| `FileBrowser` | `frontend/components/files/` | Frontend Agent |
| `PlatformStatus` | `frontend/components/platforms/` | Frontend Agent |
| `ProgressTracker` | `frontend/components/upload/` | Frontend Agent |

---

## 14. MVP SCOPE

### Phase 1 — IN SCOPE (build this first, nothing else)
- [ ] Push a single file to GitHub only
- [ ] Pull a file back from GitHub
- [ ] Full pipeline: compress → encrypt → chunk → upload → index
- [ ] Full reverse: fetch → reassemble → decrypt → decompress
- [ ] SQLite local index (file → chunks → repo)
- [ ] Auto repo rotation (GitHub, 850MB threshold)
- [ ] Basic Next.js UI: upload zone, file list, progress bar
- [ ] Settings page: GitHub token input
- [ ] Onboarding flow: connect GitHub, set passphrase hint

### Phase 1 — OUT OF SCOPE (do not build yet)
- [ ] GitLab / HuggingFace / Telegram adapters
- [ ] Multi-platform waterfall
- [ ] Folder sync / watch mode
- [ ] Key rotation
- [ ] Sharing / public links
- [ ] Mobile app
- [ ] Auto-updater
- [ ] Code signing

---

## AGENT SESSION START CHECKLIST

Before writing any code, every agent must confirm:

```
□ I have read this entire AGENTS.md file
□ I know which agent role I am operating as
□ I know which directories I own and which I do not touch
□ I will not reorder the pipeline sequence
□ I will not store passphrases or tokens in plaintext
□ I will not add Electron, a cloud backend, or server infrastructure
□ I will use the exact component names from Section 13
□ I am only building Phase 1 MVP scope unless explicitly told otherwise
```

---

*AGENTS.md — zpush v0.1 — Last updated: 2025*
*When making breaking architectural changes, bump the version number at the top of this file.*