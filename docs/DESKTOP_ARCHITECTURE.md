# Desktop & Mobile Architecture — zcrypt-core Rust

## Overview

zcrypt's desktop and mobile clients run a unified **zcrypt-core** Rust crate inside the Tauri v2 shell, eliminating the Go sidecar subprocess. The Rust engine handles zero-knowledge crypto, the chunk pipeline, local sync state, and direct-to-platform uploads via the user's own credentials from the OS keychain.

### Why Rust? Why not the sidecar?

The Go sidecar (shipping a separate subprocess in desktop builds) is **impossible on iOS**: Apple forbids child processes in app sandboxes. A single in-process engine (Rust compiled to native code in the Tauri app) works everywhere:
- **Desktop**: Tauri app directly calls the engine (no IPC, no subprocess).
- **iOS/Android**: Same engine, same app, zero extra processes.

The sidecar stays in the backend only (server-side crypto for re-encryption during space transitions).

---

## Architecture

```
┌─ Tauri v2 Shell (TypeScript frontend in WebView) ──────────────────┐
│                                                                      │
│  [Tauri IPC]  ←→  [zcrypt-core Rust crate in-process]              │
│                                                                      │
│   • Window management, OS integrations (keychain, file picker)      │
│   • Event listeners (SSE, local SQLite changes, platform sync)      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
          ┌──────────────────────────────────────┐
          │  Backend Control Plane                │
          │  POST /api/repos/register             │
          │  POST /api/upload-event               │
          │  GET  /api/files                      │
          │  SSE  /api/events                     │
          │  GET  /api/changes?cursor=...         │
          └──────────────────────────────────────┘
                              ↓
          ┌──────────────────────────────────────┐
          │  Platform Direct Uploads (BYOS)       │
          │  GitHub / GitLab / HuggingFace        │
          │  Telegram (unlimited storage)         │
          └──────────────────────────────────────┘
```

**No subprocess, no sidecar, no inter-process serialization.**

---

## zcrypt-core Module Map

**app/core/src/**

| Module | Purpose |
|--------|---------|
| **crypto** | PBKDF2-HMAC-SHA256 key derivation, AES-256-GCM encrypt/decrypt (wire format: `[12B IV \|\| ct \|\| 16B tag]`), HMAC-SHA256 (dedup MAC), SHA-256 file hashing. Normative-conformant to `docs/CRYPTO_FORMAT.md` + conformance vectors at `app/backend/crypto/testvectors/vectors.json`. |
| **compression** | Zstd compress/decompress with format detection (skip list for already-compressed extensions). Per-chunk decision: compress only if ≥5% smaller than input. |
| **profiles** | Device performance tiers: `light` (2 workers, 4 MiB chunks, z1), `normal` (4 workers, 10 MiB, z2), `intense` (8 workers, 16 MiB, z3), `ludicrous` (all cores, 32 MiB, z3). Maps to web's device-profile picker; fallback is `normal`. |
| **disguise** | Plausible obfuscation: repo names (`simple-helpers-v1`), chunk paths (sharded: `ab/cdef1234567890.bin` or flat: `8e3168ba.bin` for Telegram), commit messages, README templates — ported verbatim from `app/backend/disguise`. |
| **adapters** | Platform-agnostic trait `PlatformAdapter` + implementations for GitHub, GitLab, HuggingFace, Telegram. All byte I/O is ciphertext; adapters are platform-dumb. Methods: `create_repo()`, `upload()`, `download()`, `delete()`, `get_repo_size()`, `list_chunks()`. Mirrors the backend's `app/backend/adapters/*` (client-side port). |
| **placement** | Multi-platform placement policy: weighted scoring favors Telegram (unlimited capacity), filters by health/capacity/rate-budget, falls back to relay if nothing is eligible. Modes: `smart` (default, capacity-aware), `most_free` (rclone `mfs`), `spread` (round-robin). |
| **reppool** | Client-side repo pool manager. Wraps a user's platform token and account name; rotates repos when they hit thresholds (GitHub 850 MB, GitLab 9 GB, HuggingFace 90 GB — safely under HF's 100 GB free tier). Trait `RepoStore` abstracts the control-plane calls (`list_repos`, `register_repo`, `update_usage`, `deactivate_repo`). |
| **engines** | Pipeline engines (placeholder, being filled in by P1 port): `local_upload`, `upload`, `download`, `sync`, `ordered_writer`. |
| **api** | Backend API client (placeholder). SSE listener, `/api/changes` cursor syncer, auth refresh. |
| **localdb** | Embedded SQLite ledger: file records, chunk status, sync state, platform credentials (wrapped with KEK). Mirrors the backend's index schema; answers upload resume, dedup MAC lookups, and sync cursor. |
| **types** | Shared types: `File`, `Chunk`, `ChunkRef`, `RepoInfo`, `PlatformState`, etc. |

---

## Key Invariants & Contracts

### Conformance Vector Contract
- **Crypto normative**: zcrypt-core **must pass** `app/backend/crypto/testvectors/vectors.json`.
- **Test command**: `cargo test -p zcrypt-core conformance` (once all modules are ported).
- **Scope**: PBKDF2, GCM encrypt/decrypt, CEK unwrap, SHA-256, HMAC-SHA256 (dedup key), name decryption, zstd round-trip.
- **Never change crypto behavior without regenerating vectors and updating TS + Go in the same commit.**

### Platform Adapter Dumb Ciphertext Invariant
- Adapters never see plaintext; all byte payloads are pre-encrypted chunks.
- Client pre-pends chunk metadata (repo, path, SHA-256 of ciphertext) but the ciphertext itself is opaque to the platform.
- Mirrors the backend's design (storage layer doesn't know file content).

### Repo Pool Statefulness
- Repos are created client-side with the user's own platform token.
- Each repo is registered with the backend via `POST /api/repos/register` (metadata-only: ID, platform, account, name, capacity).
- Backend tracks usage (user-reported, cross-checked); client tracks local file assignments.
- Rotation is transparent: when a repo hits capacity, the client creates a new one + registers it.

---

## BYOS-Direct Data Plane

**Desktop and mobile use the client's OWN platform credentials (from OS keychain) to upload directly to GitHub, GitLab, HuggingFace, or Telegram. The backend never touches the platform token.**

### Flow

1. **User connects a platform** (e.g., GitHub PAT in iOS Settings).
2. **OS keychain** stores the token; zcrypt reads it on demand.
3. **Client picks a platform** via `placement::pick_platform()` (respects capacity, rate budget, health).
4. **Chunk loop**:
   - Client encrypts & compresses chunk with user's passphrase-derived keys.
   - Client calls `adapter.upload(repo, chunk)` with the token.
   - Platform writes the ciphertext; client records the chunk metadata locally + sends confirmation to backend.
5. **Backend receives**:
   - Metadata-only (file ID, chunk index, platform, repo, SHA-256 of ciphertext for integrity).
   - User-reported `used_bytes` in the repo.
   - **Never receives the token, never sees plaintext, never re-encrypts.**

### Why BYOS?
- **Unlimited scale**: Client+platform directly = no backend I/O bottleneck.
- **Trust**: User controls their storage; backend is a coordinator, not a gatekeeper.
- **Offline**: Client can queue uploads/downloads locally and sync when internet returns.

### Web clients (browser)
- **No direct platform access** (browser sandbox forbids arbitrary CORS + token reuse).
- **Relay via backend**: Client uploads ciphertext to `/api/upload` (backend temporarily holds platform token for that upload, never stores it).
- Backend forwards to the platform on behalf of the client.

---

## Sync Model

**Local SQLite ledger + SSE event stream + cursor-based incremental pull.**

### Architecture
```
┌─ Local SQLite (zcrypt-core::localdb) ───────────┐
│ • Files (id, name, salt, wrapped_cek, ...)      │
│ • Chunks (file_id, idx, sha256, compressed)     │
│ • Repos (id, platform, account, used_bytes)     │
│ • Sync cursor (last_event_id, last_changes_ts)  │
└──────────────────────────────────────────────────┘
         ↑                          ↑
         └──────────────┬───────────┘
                        │
        ┌───────────────┴────────────────┐
        │  SSE /api/events               │
        │  ("file.created", "file.        │
        │   updated", "member_granted",   │
        │   etc. with cursor position)    │
        │                                │
        │  Pull /api/changes?            │
        │  cursor=<last_event_id>        │
        │  (backfill after reconnect)    │
        └────────────────────────────────┘
```

### Sync Guarantees
1. **Append-only**: Files/chunks are only added, never overwritten (until tombstone/deletion).
2. **Event ordering**: SSE stream is ordered; cursor allows resumption.
3. **Divergence recovery**: On mismatch (stale local ledger), pull `/api/changes?cursor=<ts>` to reconstruct state.
4. **Offline queueing**: Local changes queued in SQLite until backend ACKs.

### Events the client reacts to
- `"file.created"` / `"file.updated"`: Refresh the file list.
- `"file.deleted"`: Mark locally as tombstone (soft delete).
- `"member_granted"`: Shared vault access revoked or rotated.
- `"member_revoked"`: Evict local cache for that space.
- `"space.key_rotated"`: Re-wrap all local space files under the new key.

---

## Updater Key Ceremony

The Tauri v2 updater verifies app signatures using a keypair. **This must be set up before the first release.**

### One-time setup

```bash
# Generate the Tauri signer keypair
bunx @tauri-apps/cli@v2 signer generate -w ~/.tauri/zcrypt.key

# This creates:
#   ~/.tauri/zcrypt.key       (PRIVATE — never commit, never share)
#   ~/.tauri/zcrypt.key.pub   (PUBLIC — goes in tauri.conf.json)
```

### Configure tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "dW5pcXVlX3B1YmxpY19rZXlfaGVyZQ==",
      "endpoints": [
        "https://api.github.com/repos/zcrypt/zcrypt/releases/latest"
      ]
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

- **pubkey**: Extract the public key from `~/.tauri/zcrypt.key.pub` (base64-encoded).
- **endpoints**: GitHub Releases latest.json is the primary source (Tauri auto-checks there).

### CI: Sign and publish

```bash
# Set as a GitHub Actions secret (never in the repo)
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/zcrypt.key | base64)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<if key is encrypted>"

# During release:
bunx @tauri-apps/cli@v2 build --sign
# Tauri creates *.app.tar.gz + *.app.tar.gz.sig

# Upload .app.tar.gz + .app.tar.gz.sig to GitHub Releases
# Tauri updater will verify the signature before installing
```

### Recovery: Key rotation (after compromise)
1. Generate new keypair: `bunx @tauri-apps/cli signer generate -w ~/.tauri/zcrypt-new.key`.
2. Update `tauri.conf.json` with the new public key.
3. Release a new version with the fresh key.
4. Existing clients will fetch the new version (checking the old key, which still validates) and then update to the new key in-process.

---

## Mobile Targets

### Android

```bash
# Prerequisites
# • Android SDK (API 21+) and NDK installed
# • ANDROID_HOME set

tauri android init
# Scaffolds:
#   src-tauri/gen/android/
#   AndroidManifest.xml (permissions, activities)
#   build.gradle (local, project)

# Build APK
tauri android build

# Deploy to device / Google Play
adb install app-release.apk
# or upload to Play Store
```

### iOS

```bash
# Prerequisites
# • Xcode 14+
# • Apple Developer account (free personal team for dev; paid for distribution)
# • iOS 12+

tauri ios init
# Scaffolds:
#   src-tauri/gen/ios/
#   Xcode project
#   Podfile (CocoaPods deps)

# Build IPA
tauri ios build

# Deploy to device / App Store
# (Xcode or TestFlight for beta)
```

---

## Notes

- **Local file I/O**: Tauri's `fs` module handles sandboxed file access (user picks files via native picker; app has read access to those files + app documents folder).
- **Platform tokens**: OS keychain (`Keychain` on macOS/iOS, `Keystore` on Android) stores platform PATs at rest.
- **Network**: Tauri `http` module handles HTTP requests (CORS is not a constraint for in-app requests).
- **Crypto acceleration**: Rust crypto deps (aes-gcm, sha2, pbkdf2) use optimized C libraries where available; no JS overhead.
