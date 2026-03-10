# zpush Client-Side Computation Architecture

## Overview

This document describes the architectural shift from server-side to client-side file processing in zpush. The core idea: move compression, encryption, chunking, and hashing from the Go backend to the user's device. The server becomes a thin authenticated relay — it never sees plaintext data.

```
CURRENT (Server-Side):
  Browser ──(raw file)──→ Go Server: compress → encrypt → chunk → upload to platform
  Server sees plaintext. Server does all compute. Server RAM = 2x file size.

NEW (Client-Side):
  Client: compress → encrypt → chunk → hash
  Client ──(encrypted chunks)──→ Go Server: validate → relay to platform
  Server never sees plaintext. Server does zero compute. Server RAM ≈ 30MB constant.
```

---

## Why This Change

| Problem | Current | After Migration |
|---------|---------|-----------------|
| **Max file size** | ~500MB (encryption loads full file into RAM) | Unlimited (streaming per-chunk) |
| **Server RAM per upload** | 2x file size (encrypt doubles it) | ~30MB constant |
| **Zero-knowledge claim** | Partially true (server briefly holds plaintext) | **Fully true** (server never sees plaintext) |
| **Concurrent uploads** | Limited by server RAM | Limited by client count (server is stateless) |
| **Server cost** | High (Railway processes every byte) | Low (just relays encrypted blobs) |

### Real-World Incident: 300MB File Crashes Railway

On March 2026, a 300MB file upload caused an **out-of-memory (OOM) crash** on Railway, confirming the exact bottleneck described above.

**Root cause chain:**

```
1. User uploads 300MB file via POST /api/push
2. Server writes raw file to temp disk                  → 300MB disk
3. pipeline/engine.go calls crypto.EncryptFile()
4. crypto/encrypt.go line 28:
     plaintext, _ := os.ReadFile(srcPath)               → +300MB RAM
5. crypto/encrypt.go line 43:
     ciphertext := gcm.Seal(nil, iv, plaintext, nil)    → +300MB RAM (new allocation)
6. Total server RAM: ~600MB for a 300MB file
7. Railway container (512MB limit) → OOM kill → request fails
```

**Why 2x RAM:** `gcm.Seal()` allocates a new byte slice for the ciphertext (plaintext size + 16-byte auth tag). The original plaintext remains in memory until `Seal()` completes. Go's garbage collector cannot reclaim it because it's still referenced. So both the 300MB plaintext and the ~300MB ciphertext coexist in RAM simultaneously.

**The math for any file size:**

```
Server RAM required = 2 × file_size + overhead

  100MB file →  ~200MB RAM  ✓ (fits in 512MB container)
  300MB file →  ~600MB RAM  ✗ (OOM on 512MB container)
  500MB file → ~1000MB RAM  ✗ (OOM on any reasonable container)
    1GB file →   ~2GB RAM   ✗ (needs expensive dedicated instance)
   10GB file →  ~20GB RAM   ✗ (impossible)
```

**This is not fixable by scaling Railway.** Even a 2GB container only supports ~900MB files. The architecture itself must change — either per-chunk encryption (server-side fix) or moving encryption to the client entirely (this document's proposal).

**Relevant code locations:**

- [engine.go:162](app/backend/pipeline/engine.go#L162) — calls `crypto.EncryptFile()`
- [encrypt.go:28](app/backend/crypto/encrypt.go#L28) — `os.ReadFile(srcPath)` loads entire file
- [encrypt.go:43](app/backend/crypto/encrypt.go#L43) — `gcm.Seal()` doubles RAM
- [encrypt.go:65-66](app/backend/crypto/encrypt.go#L65-L66) — existing comment acknowledges the limitation

---

## Cryptographic Specification

### Parameters (Unchanged from Current)

```
Algorithm:        AES-256-GCM
Key Size:         256 bits (32 bytes)
IV/Nonce Size:    96 bits (12 bytes)
Auth Tag Size:    128 bits (16 bytes)
Salt Size:        256 bits (32 bytes)
Key Derivation:   PBKDF2-SHA256
KDF Iterations:   600,000
Chunk Size:       10 MB (10,485,760 bytes)
Compression:      zstd (level: best compression)
Hash:             SHA-256
```

### Per-Chunk Encryption (New)

Currently, the entire file is encrypted as one AES-GCM operation. This requires the full plaintext in memory. The new approach encrypts each chunk independently.

```
Current (per-file encryption):
  1. salt = random(32 bytes)          — one salt per file
  2. iv = random(12 bytes)            — one IV per file
  3. key = PBKDF2(passphrase, salt)   — one key per file
  4. ciphertext = AES-GCM-Encrypt(key, iv, ENTIRE_FILE)
  5. output = salt || iv || ciphertext || tag

New (per-chunk encryption):
  1. salt = random(32 bytes)          — one salt per file (shared across chunks)
  2. key = PBKDF2(passphrase, salt)   — one key per file (derived once)
  3. For each chunk:
     a. iv = random(12 bytes)         — unique IV per chunk (CRITICAL)
     b. ciphertext = AES-GCM-Encrypt(key, iv, chunk_plaintext)
     c. chunk_output = iv || ciphertext || tag
  4. File salt stored in metadata (database + manifest)
```

**Why unique IV per chunk:** AES-GCM is catastrophically broken if the same (key, IV) pair is used twice. Since all chunks share the same derived key, each chunk MUST have a unique random IV. With 12-byte random IVs, collision probability is negligible for up to 2^32 chunks per file (birthday bound).

**Chunk wire format:**

```
┌──────────┬─────────────────────────────┬──────────┐
│ IV       │ Ciphertext                  │ Auth Tag │
│ 12 bytes │ chunk_size bytes            │ 16 bytes │
└──────────┴─────────────────────────────┴──────────┘
Total overhead per chunk: 28 bytes (negligible for 10MB chunks)
```

**File metadata (stored in database):**

```json
{
  "salt": "base64(32 bytes)",
  "chunk_count": 102,
  "encryption_mode": "per-chunk",
  "original_sha256": "hex(32 bytes)"
}
```

Note: IV is NOT stored in the database. Each chunk carries its own IV as a prefix. The salt IS stored because it's needed to re-derive the key for decryption.

### Key Derivation Flow

```
User enters passphrase
        │
        ▼
  ┌─────────────┐
  │ PBKDF2-SHA256│
  │ 600,000 iter │
  │ salt (32B)   │
  └──────┬──────┘
         │
         ▼
   256-bit AES key
         │
    ┌────┴────┐
    ▼         ▼
 Chunk 0    Chunk 1    ...    Chunk N
 IV₀(12B)   IV₁(12B)         IVₙ(12B)
 GCM Seal   GCM Seal         GCM Seal
```

---

## Client-Side Pipeline

### Upload Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser / Mobile / Desktop)       │
│                                                                  │
│  Step 1: FILE INPUT                                              │
│  ─────────────────                                               │
│  User selects file via <input> or drag-and-drop                  │
│  file: File object (Blob interface)                              │
│                                                                  │
│  Step 2: INITIATE UPLOAD                                         │
│  ────────────────────                                            │
│  POST /api/upload/init                                           │
│  Body: { filename, file_size, passphrase_hash }                  │
│  Response: { upload_id, chunk_size: 10485760 }                   │
│                                                                  │
│  Step 3: DERIVE KEY (once per file)                              │
│  ──────────────────                                              │
│  salt = crypto.getRandomValues(32 bytes)                         │
│  key = await crypto.subtle.deriveKey(                            │
│    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },│
│    passphraseKey,                                                │
│    { name: "AES-GCM", length: 256 },                            │
│    false,  // non-extractable                                    │
│    ["encrypt"]                                                   │
│  )                                                               │
│                                                                  │
│  Step 4: PROCESS CHUNKS (sequential or parallel via Workers)     │
│  ────────────────────                                            │
│  for (let i = 0; i < totalChunks; i++) {                         │
│    // 4a. Read chunk from file                                   │
│    const slice = file.slice(i * CHUNK_SIZE, (i+1) * CHUNK_SIZE)  │
│    const raw = await slice.arrayBuffer()                         │
│                                                                  │
│    // 4b. Compress chunk (optional, via WASM)                    │
│    const compressed = zstd.compress(raw)                         │
│    const useCompressed = compressed.length < raw.length          │
│    const payload = useCompressed ? compressed : raw              │
│                                                                  │
│    // 4c. Encrypt chunk                                          │
│    const iv = crypto.getRandomValues(12 bytes)                   │
│    const ciphertext = await crypto.subtle.encrypt(               │
│      { name: "AES-GCM", iv },                                   │
│      key,                                                        │
│      payload                                                     │
│    )                                                             │
│                                                                  │
│    // 4d. Build chunk blob: IV || ciphertext (includes GCM tag)  │
│    const chunk = concat(iv, ciphertext)                          │
│                                                                  │
│    // 4e. Hash chunk                                             │
│    const hash = await crypto.subtle.digest("SHA-256", chunk)     │
│                                                                  │
│    // 4f. Upload chunk                                           │
│    PUT /api/upload/{upload_id}/chunk/{i}                         │
│    Headers: X-Chunk-SHA256: hex(hash)                            │
│    Body: chunk (binary)                                          │
│  }                                                               │
│                                                                  │
│  Step 5: FINALIZE                                                │
│  ────────────────                                                │
│  POST /api/upload/{upload_id}/complete                           │
│  Body: {                                                         │
│    salt: base64(salt),                                           │
│    original_sha256: hex(fileHash),                               │
│    original_size: file.size,                                     │
│    compressed: bool,                                             │
│    chunk_count: N                                                │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Go Backend)                       │
│                                                                  │
│  /api/upload/init:                                               │
│    - Authenticate user (JWT)                                     │
│    - Check quota                                                 │
│    - Generate upload_id (UUID)                                   │
│    - Create upload session in DB (status: "initiated")           │
│    - Return { upload_id, chunk_size }                            │
│                                                                  │
│  /api/upload/{id}/chunk/{index}:                                 │
│    - Authenticate user                                           │
│    - Validate upload session exists and belongs to user          │
│    - Read encrypted chunk from request body (streaming)          │
│    - Verify SHA-256 matches X-Chunk-SHA256 header                │
│    - Get or create repo via reppool                              │
│    - Stream chunk directly to platform adapter                   │
│    - Store chunk ref in DB (platform, repo, remote_path)         │
│    - Return { chunk_index, stored: true }                        │
│                                                                  │
│  /api/upload/{id}/complete:                                      │
│    - Validate all chunks received                                │
│    - Store file metadata (salt, sha256, sizes, chunk_count)      │
│    - Update file status to "complete"                            │
│    - Return { file_id, status: "complete" }                      │
│                                                                  │
│  SERVER NEVER:                                                   │
│    - Decrypts data                                               │
│    - Decompresses data                                           │
│    - Holds the passphrase                                        │
│    - Sees the salt during processing (only stores it at the end) │
│    - Allocates more than ~30MB per upload                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Download Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT                                    │
│                                                                  │
│  Step 1: REQUEST FILE INFO                                       │
│  GET /api/files/{file_id}                                        │
│  Response: { salt, chunk_count, original_size, compressed, ... } │
│                                                                  │
│  Step 2: DERIVE KEY                                              │
│  key = PBKDF2(passphrase, salt, 600000, SHA-256) → AES-256 key  │
│                                                                  │
│  Step 3: DOWNLOAD + DECRYPT CHUNKS (parallel, 4-8 concurrent)   │
│  for each chunk i:                                               │
│    GET /api/files/{file_id}/chunks/{i}                           │
│    Response: raw encrypted chunk bytes                           │
│                                                                  │
│    // Parse chunk: first 12 bytes = IV, rest = ciphertext+tag    │
│    iv = chunk.slice(0, 12)                                       │
│    ciphertext = chunk.slice(12)                                  │
│                                                                  │
│    // Decrypt                                                    │
│    plaintext = AES-GCM-Decrypt(key, iv, ciphertext)              │
│                                                                  │
│    // Decompress (if file was compressed)                        │
│    data = compressed ? zstd.decompress(plaintext) : plaintext    │
│                                                                  │
│    // Append to output                                           │
│    outputParts[i] = data                                         │
│                                                                  │
│  Step 4: ASSEMBLE FILE                                           │
│  file = concat(outputParts[0], outputParts[1], ..., outputParts[N])│
│  verify SHA-256(file) === original_sha256                        │
│  trigger browser download or save to device                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER                                    │
│                                                                  │
│  GET /api/files/{file_id}/chunks/{index}:                        │
│    - Authenticate user                                           │
│    - Look up chunk ref in DB (platform, repo, remote_path)       │
│    - Resolve adapter for chunk's platform                        │
│    - Download from platform → stream to client                   │
│    - Server sees only encrypted bytes (cannot decrypt)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Web Worker Architecture

### Why Workers

The main browser thread must stay free for UI rendering. Compression and encryption are CPU-bound — running them on the main thread freezes the UI. Web Workers run on separate OS threads.

### Worker Pool Design

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN THREAD                              │
│                                                              │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ File     │────→│ Chunk Queue  │────→│ Upload Queue │    │
│  │ Picker   │     │ (in-memory)  │     │ (IndexedDB)  │    │
│  └──────────┘     └──────┬───────┘     └──────┬───────┘    │
│                          │                     │            │
│                    ┌─────┴─────┐         ┌─────┴─────┐     │
│                    │ Dispatch  │         │ Upload    │     │
│                    │ to Workers│         │ Manager   │     │
│                    └─────┬─────┘         └───────────┘     │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ Worker 1  │ │Wrkr 2 │ │ Worker 3  │
        │           │ │       │ │           │
        │ Read      │ │ Read  │ │ Read      │
        │ Compress  │ │ Compr │ │ Compress  │
        │ Encrypt   │ │ Encr  │ │ Encrypt   │
        │ Hash      │ │ Hash  │ │ Hash      │
        │           │ │       │ │           │
        │ Post back │ │ Post  │ │ Post back │
        └───────────┘ └───────┘ └───────────┘
```

### Worker Count by Platform

| Platform | Recommended Workers | Why |
|----------|-------------------|-----|
| Desktop browser | 4-8 | Multiple CPU cores, plenty of RAM |
| Mobile browser | 1-2 | Limited cores, battery concern |
| Capacitor (Android) | 2 | WebView constraints |
| Tauri (Desktop) | Native threads (not Workers) | Direct Rust, no Worker overhead |

### Worker Message Protocol

```typescript
// Main thread → Worker
interface WorkerTask {
  type: "process_chunk"
  chunkIndex: number
  fileSlice: ArrayBuffer        // 10MB raw chunk data
  key: CryptoKey                // AES-256 key (non-extractable, transferred)
  compress: boolean             // whether to attempt compression
}

// Worker → Main thread
interface WorkerResult {
  type: "chunk_ready"
  chunkIndex: number
  encryptedChunk: ArrayBuffer   // IV + ciphertext + tag
  sha256: string                // hex digest of encrypted chunk
  originalSize: number          // raw chunk size before processing
  processedSize: number         // after compression + encryption
  compressed: boolean           // whether compression was applied
}

interface WorkerError {
  type: "error"
  chunkIndex: number
  message: string
}

interface WorkerProgress {
  type: "progress"
  chunkIndex: number
  stage: "compressing" | "encrypting" | "hashing"
}
```

### Worker Implementation

```typescript
// crypto-worker.ts (Web Worker)

import { zstdCompress } from './zstd-wasm'  // WASM module

self.onmessage = async (e: MessageEvent<WorkerTask>) => {
  const { chunkIndex, fileSlice, key, compress } = e.data

  try {
    let payload = new Uint8Array(fileSlice)

    // Step 1: Compress (optional)
    if (compress) {
      self.postMessage({ type: "progress", chunkIndex, stage: "compressing" })
      const compressed = zstdCompress(payload)
      if (compressed.length < payload.length) {
        payload = compressed
      }
    }

    // Step 2: Encrypt
    self.postMessage({ type: "progress", chunkIndex, stage: "encrypting" })
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      payload
    )

    // Step 3: Build output: IV || ciphertext (GCM tag is appended by WebCrypto)
    const encrypted = new Uint8Array(12 + ciphertext.byteLength)
    encrypted.set(iv, 0)
    encrypted.set(new Uint8Array(ciphertext), 12)

    // Step 4: Hash
    self.postMessage({ type: "progress", chunkIndex, stage: "hashing" })
    const hashBuffer = await crypto.subtle.digest("SHA-256", encrypted)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")

    // Step 5: Return result
    self.postMessage({
      type: "chunk_ready",
      chunkIndex,
      encryptedChunk: encrypted.buffer,
      sha256: hashHex,
      originalSize: fileSlice.byteLength,
      processedSize: encrypted.byteLength,
      compressed: payload.length < fileSlice.byteLength,
    } as WorkerResult, [encrypted.buffer])  // transfer ownership (zero-copy)

  } catch (err) {
    self.postMessage({
      type: "error",
      chunkIndex,
      message: err instanceof Error ? err.message : "Unknown error",
    } as WorkerError)
  }
}
```

---

## WASM Module (Optional, for Compression)

### When to Use WASM

| Operation | Web Crypto API | WASM | Use WASM? |
|-----------|---------------|------|-----------|
| AES-256-GCM | Native, hardware-accelerated | Same speed | **No** |
| SHA-256 | Native, hardware-accelerated | Same speed | **No** |
| PBKDF2 | Native | Same speed | **No** |
| **zstd compression** | **Not available** | **Near-native speed** | **Yes** |

WASM is only needed for zstd compression. Everything else uses the Web Crypto API which is already native.

### WASM Module (Rust → WASM)

```rust
// zpush-crypto/src/lib.rs
use wasm_bindgen::prelude::*;
use zstd;

#[wasm_bindgen]
pub fn compress(data: &[u8], level: i32) -> Vec<u8> {
    zstd::encode_all(data, level).unwrap_or_else(|_| data.to_vec())
}

#[wasm_bindgen]
pub fn decompress(data: &[u8]) -> Result<Vec<u8>, JsValue> {
    zstd::decode_all(data)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
```

**Build:**

```bash
wasm-pack build --target web --out-dir pkg
# Output: zpush_crypto_bg.wasm (~200KB)
```

**Usage in Worker:**

```typescript
import init, { compress, decompress } from './zpush-crypto/pkg'

// Initialize WASM once per worker
await init()

// Compress a chunk
const compressed = compress(chunkData, 3)  // level 3 = good balance
```

### Compression Decision Per-Chunk

Each chunk independently decides whether compression helps:

```typescript
const compressed = zstdCompress(rawChunk)
const useCompressed = compressed.length < rawChunk.length * 0.95  // 5% threshold
const payload = useCompressed ? compressed : rawChunk
```

The `compressed` flag is stored per-chunk in the manifest so the download pipeline knows whether to decompress each chunk.

---

## Server API Changes

### New Endpoints

```
POST   /api/upload/init                    — Create upload session
PUT    /api/upload/{id}/chunk/{index}       — Upload single encrypted chunk
POST   /api/upload/{id}/complete           — Finalize upload
DELETE /api/upload/{id}                    — Cancel upload

GET    /api/files/{id}                     — File metadata (salt, chunk count, etc.)
GET    /api/files/{id}/chunks/{index}      — Download single encrypted chunk
```

### Removed Server Responsibilities

```go
// BEFORE: Server pipeline (pipeline/engine.go)
func (pe *PipelineEngine) Prepare(...) {
    validate()           // KEEP — but simpler (just check metadata)
    compress()           // REMOVE — client does this
    encrypt()            // REMOVE — client does this
    chunk()              // REMOVE — client does this
    hashChunks()         // REMOVE — client does this
    indexFile()           // KEEP — store metadata
    getRepo()            // KEEP — repo management
}

func (pe *PipelineEngine) Upload(...) {
    readChunkFromDisk()  // REMOVE — client sends chunk directly
    uploadToAdapter()    // KEEP — relay to platform
    updateDB()           // KEEP — track chunk location
}

// AFTER: Server is a thin relay
func HandleChunkUpload(w http.ResponseWriter, r *http.Request) {
    authenticate(r)
    validateSession(uploadID)

    // Stream encrypted chunk directly to platform (never buffer full chunk)
    chunkData := r.Body  // streaming reader
    verifyHash(chunkData, expectedHash)

    repo := pool.GetOrCreateRepo(userID, platform, account)
    ref := adapter.Upload(ctx, repo, chunk)
    db.StoreChunkRef(uploadID, chunkIndex, ref)
}
```

### Server Chunk Upload Handler (Streaming)

```go
func (s *Server) HandleChunkUpload(w http.ResponseWriter, r *http.Request) {
    userID := r.Context().Value("user_id").(string)
    uploadID := chi.URLParam(r, "uploadID")
    chunkIndex, _ := strconv.Atoi(chi.URLParam(r, "chunkIndex"))
    expectedHash := r.Header.Get("X-Chunk-SHA256")

    // Validate session
    session, err := s.db.GetUploadSession(r.Context(), uploadID, userID)
    if err != nil {
        http.Error(w, "invalid upload session", 404)
        return
    }

    // Read chunk from request body (streaming, max 11MB: 10MB + 28B overhead)
    chunk, err := io.ReadAll(io.LimitReader(r.Body, 11*1024*1024))
    if err != nil {
        http.Error(w, "failed to read chunk", 400)
        return
    }

    // Verify integrity
    hash := sha256.Sum256(chunk)
    if hex.EncodeToString(hash[:]) != expectedHash {
        http.Error(w, "chunk hash mismatch", 400)
        return
    }

    // Get repo and upload
    repo, err := s.pool.GetOrCreateRepo(r.Context(), userID, session.Platform, session.Account)
    if err != nil {
        http.Error(w, "no available repo", 500)
        return
    }

    ref, err := s.adapter.Upload(r.Context(), repo, types.Chunk{
        Data: chunk,
        Ref: types.ChunkRef{
            FileID: session.FileID,
            Index:  chunkIndex,
            Size:   int64(len(chunk)),
            SHA256: expectedHash,
        },
    })
    if err != nil {
        http.Error(w, "upload failed", 500)
        return
    }

    // Store chunk reference
    s.db.StoreChunkRef(r.Context(), session.FileID, chunkIndex, ref)

    json.NewEncoder(w).Encode(map[string]any{
        "chunk_index": chunkIndex,
        "stored":      true,
    })
}
```

---

## Resumability

### Upload Resume

```
Scenario: User uploads 50-chunk file, connection dies after chunk 30.

1. Upload session stored in IndexedDB (client) + DB (server)
2. On next app open:
   a. Client checks IndexedDB for incomplete uploads
   b. GET /api/upload/{id}/status → { completed_chunks: [0,1,...,29] }
   c. Client resumes from chunk 30
   d. Key re-derived from passphrase + stored salt (salt in IndexedDB)
3. No re-processing of already-uploaded chunks
```

### Client-Side Persistence (IndexedDB)

```typescript
interface UploadSession {
  uploadId: string
  fileId: string
  fileName: string
  fileSize: number
  salt: Uint8Array              // needed to re-derive key on resume
  totalChunks: number
  completedChunks: number[]     // indices of uploaded chunks
  compressed: boolean
  startedAt: number
  platform: string
}
```

### Server-Side Session

```sql
CREATE TABLE upload_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    file_id     UUID NOT NULL,
    filename    TEXT NOT NULL,
    file_size   BIGINT NOT NULL,
    salt        BYTEA NOT NULL,
    chunk_count INT NOT NULL,
    platform    TEXT NOT NULL,
    account     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',  -- active, complete, cancelled
    expires_at  TIMESTAMPTZ NOT NULL,            -- auto-cleanup after 7 days
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Platform-Specific Implementation

### Browser (Web)

```
┌──────────────────────────────────────────────┐
│  Browser                                      │
│                                               │
│  ┌─────────────┐    ┌──────────────────────┐ │
│  │ Main Thread  │    │ Web Workers (2-8)    │ │
│  │              │    │                      │ │
│  │ UI rendering │    │ compress (WASM zstd) │ │
│  │ Upload mgmt  │    │ encrypt (Web Crypto) │ │
│  │ Queue mgmt   │    │ hash (Web Crypto)    │ │
│  │ Progress UI  │    │                      │ │
│  └──────┬───────┘    └──────────┬───────────┘ │
│         │                       │              │
│         └───────────┬───────────┘              │
│                     │                          │
│  ┌──────────────────▼───────────────────────┐ │
│  │ IndexedDB                                 │ │
│  │ - Upload sessions (resume)                │ │
│  │ - File metadata cache                     │ │
│  │ - Thumbnail cache                         │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  APIs used:                                   │
│  - Web Crypto API (AES-GCM, PBKDF2, SHA-256) │
│  - Web Workers (parallel processing)          │
│  - File.slice() (chunked file reading)        │
│  - IndexedDB (persistence)                    │
│  - Fetch/XHR (upload with progress)           │
│  - WASM (zstd compression only)               │
│                                               │
│  Limits:                                      │
│  - Workers: 2-8 (depends on device)           │
│  - RAM: ~30MB per worker                      │
│  - Max file: limited by disk (File API)       │
│  - Practical max: ~10GB                       │
└──────────────────────────────────────────────┘
```

### Mobile — Capacitor (Android/iOS)

```
┌──────────────────────────────────────────────┐
│  Capacitor App                                │
│                                               │
│  ┌───────────────────────────────────────┐    │
│  │ WebView                                │    │
│  │                                        │    │
│  │ Same as Browser:                       │    │
│  │ - Web Workers (1-2)                    │    │
│  │ - Web Crypto API                       │    │
│  │ - WASM zstd                            │    │
│  │ - IndexedDB for sessions               │    │
│  │                                        │    │
│  │ Additional:                            │    │
│  │ - Capacitor Preferences (secure store) │    │
│  │ - Background Task plugin               │    │
│  └────────────────┬──────────────────────┘    │
│                   │                           │
│  ┌────────────────▼──────────────────────┐    │
│  │ Native Layer                           │    │
│  │                                        │    │
│  │ - Background upload service            │    │
│  │   (survives app close)                 │    │
│  │ - Secure storage (Android Keystore)    │    │
│  │ - Push notifications (FCM)             │    │
│  │ - Biometric auth                       │    │
│  └────────────────────────────────────────┘    │
│                                               │
│  Limits:                                      │
│  - Workers: 1-2 (battery/thermal)             │
│  - RAM: ~30MB per worker                      │
│  - Practical max file: ~2GB                   │
│  - Background: 30s keepalive, then foreground │
│    service needed for longer uploads           │
└──────────────────────────────────────────────┘
```

### Desktop — Tauri (macOS/Windows/Linux)

```
┌──────────────────────────────────────────────┐
│  Tauri App                                    │
│                                               │
│  ┌───────────────────────────────────────┐    │
│  │ WebView (Frontend UI)                  │    │
│  │                                        │    │
│  │ - React UI (same Next.js frontend)     │    │
│  │ - Displays progress, manages queue     │    │
│  │ - Delegates ALL compute to Rust        │    │
│  │                                        │    │
│  └────────────────┬──────────────────────┘    │
│                   │ Tauri IPC (invoke)         │
│  ┌────────────────▼──────────────────────┐    │
│  │ Rust Backend (Native)                  │    │
│  │                                        │    │
│  │ NO Web Workers needed. NO WASM needed. │    │
│  │ Everything runs as native Rust:        │    │
│  │                                        │    │
│  │ - zstd compression (native C binding)  │    │
│  │ - AES-256-GCM (ring/aes-gcm crate)    │    │
│  │ - SHA-256 (ring crate)                 │    │
│  │ - PBKDF2 (ring crate, hardware-accel)  │    │
│  │ - File I/O (tokio async, streaming)    │    │
│  │ - HTTP upload (reqwest, parallel)      │    │
│  │                                        │    │
│  │ Parallelism:                           │    │
│  │ - tokio::spawn per chunk               │    │
│  │ - 4-8 concurrent chunk processing      │    │
│  │ - Streaming: constant ~200MB RAM       │    │
│  │                                        │    │
│  │ Extras:                                │    │
│  │ - System tray (background uploads)     │    │
│  │ - Folder watch (auto-upload)           │    │
│  │ - Native filesystem (no File API)      │    │
│  │ - OS keychain for passphrase           │    │
│  │ - No file size limit (disk-bound)      │    │
│  │                                        │    │
│  └────────────────────────────────────────┘    │
│                                               │
│  Limits:                                      │
│  - Threads: 4-8 native OS threads             │
│  - RAM: ~200MB (streaming, constant)          │
│  - Practical max file: 50GB+                  │
│  - No artificial limits                       │
└──────────────────────────────────────────────┘
```

---

## Memory Usage Comparison

### Per-Upload Memory

| | Current (Server) | Browser | Mobile | Desktop (Tauri) |
|---|---|---|---|---|
| 100MB file | 200MB server RAM | 30MB client | 30MB client | 50MB client |
| 1GB file | 2GB server RAM | 30MB client | 30MB client | 50MB client |
| 10GB file | CRASH | 30MB client | 30MB client | 50MB client |
| 50GB file | CRASH | 30MB client | N/A | 50MB client |
| Server RAM | 2x file size | **~10MB** | **~10MB** | **~10MB** |

Memory is constant because only one 10MB chunk is in memory at a time per worker/thread. Previous chunks are garbage collected after upload.

---

## Security Analysis

### Threat Model

| Threat | Current Architecture | Client-Side Architecture |
|--------|---------------------|------------------------|
| Server compromise | Attacker sees plaintext during processing | **Attacker sees only encrypted blobs** |
| Database leak | Salt + IV exposed, but useless without passphrase | Same — salt exposed, useless without passphrase |
| Platform token leak | Attacker downloads encrypted chunks | Same — chunks are encrypted |
| Man-in-middle | TLS protects transit (plaintext on server) | TLS protects transit (**end-to-end encrypted**) |
| Rogue server admin | Can read files during processing | **Cannot read files at any point** |
| Passphrase brute force | 600,000 PBKDF2 iterations | Same — 600,000 PBKDF2 iterations |

**Client-side is strictly more secure.** The server never has access to plaintext, making zpush truly zero-knowledge.

### What the Server Can Still See

Even with client-side encryption, the server knows:

```
- File name (sent in metadata)         → FIX: encrypt filename with passphrase
- File size (original + encrypted)     → Cannot hide (needed for quota)
- Number of chunks                     → Cannot hide (needed for storage)
- Upload timestamps                    → Cannot hide (needed for billing)
- Which platform stores chunks         → Cannot hide (server manages this)
- User identity                        → Cannot hide (needed for auth)
```

To further minimize metadata exposure, file names can be encrypted client-side and stored as opaque blobs. The server would store an encrypted filename and only the client (with passphrase) can read it.

---

## Migration Strategy

### Phase 1: Add New API Endpoints (Backward Compatible)

```
Add:    POST /api/upload/init
        PUT  /api/upload/{id}/chunk/{index}
        POST /api/upload/{id}/complete
        GET  /api/files/{id}/chunks/{index}

Keep:   POST /api/push     (old endpoint, still works)
        POST /api/pull     (old endpoint, still works)
```

Both old and new endpoints coexist. Old clients use server-side processing. New clients use client-side processing.

### Phase 2: Frontend — Add Client-Side Processing

```
1. Create Web Worker with Web Crypto + WASM zstd
2. Modify upload flow to use new endpoints
3. Add IndexedDB persistence for resume
4. Add per-chunk progress tracking
5. Test with both old and new flows
```

### Phase 3: Database — Track Encryption Mode

```sql
ALTER TABLE files ADD COLUMN encryption_mode TEXT DEFAULT 'server';
-- 'server' = old way (salt+IV in file header)
-- 'client' = new way (salt in metadata, IV per-chunk)
```

Download pipeline checks `encryption_mode` to know how to serve the file.

### Phase 4: Deprecate Server-Side Processing

```
1. Default new uploads to client-side
2. Keep server-side for API/SDK users who want simplicity
3. Eventually remove server-side for direct uploads
```

### Backward Compatibility

Files uploaded with the old (server-side) method remain downloadable. The download pipeline checks `encryption_mode`:

```go
if file.EncryptionMode == "server" {
    // Old way: fetch all chunks, merge, decrypt whole file, decompress
    return pe.legacyPull(ctx, file, passphrase)
}
// New way: serve individual encrypted chunks, client decrypts
return pe.serveChunk(ctx, file, chunkIndex)
```

---

## Performance Expectations

### Upload Speed (100Mbps connection, 1GB file)

```
Current (server-side):
  Client upload raw file:     80s
  Server compress:            3s
  Server encrypt (in RAM):    1s
  Server chunk:               0.5s
  Server upload to platform:  80s
  Total:                      ~165s (2.75 min)
  Bottleneck:                 Server RAM, sequential processing

Client-side (4 workers):
  Worker: read+compress+encrypt chunk:  ~50ms per chunk (overlapped)
  Client upload encrypted chunk:        ~0.8s per chunk
  Server relay to platform:             ~0.8s per chunk (overlapped with client upload)
  100 chunks, 4 workers:                ~25s compute + ~80s network
  Total:                                ~80s (1.3 min)
  Bottleneck:                           Network only
```

Client-side is ~2x faster because compute overlaps with network I/O. While chunk 1 uploads, chunks 2-4 are being processed.

### Upload Speed (1Gbps connection, 10GB file)

```
Current:      IMPOSSIBLE (server OOM at ~500MB)

Client-side:
  1000 chunks, 4 workers
  Compute: ~5s total (overlapped with network)
  Network: ~80s
  Total: ~85s (1.4 min)
```

---

## File Size Limits Summary

| Platform | Current (Server-Side) | After Migration (Client-Side) |
|----------|----------------------|------------------------------|
| Browser | 500MB (server OOM) | **10GB** (limited by temp storage) |
| Mobile (Capacitor) | 500MB | **2GB** (limited by device storage) |
| Desktop (Tauri) | 500MB | **50GB+** (limited by disk space) |
| Server RAM usage | 2x file size | **~30MB constant** |

---

## Appendix A: Encryption Compatibility

### Decrypting Old Files (server-encrypted)

```
File format: [32B salt][12B IV][ciphertext + 16B tag]

1. Read entire encrypted file
2. salt = file[0:32]
3. iv = file[32:44]
4. ciphertext = file[44:]
5. key = PBKDF2(passphrase, salt)
6. plaintext = AES-GCM-Open(key, iv, ciphertext)
```

### Decrypting New Files (client-encrypted, per-chunk)

```
Each chunk format: [12B IV][ciphertext + 16B tag]
Salt: stored in file metadata (database)

1. Fetch salt from file metadata
2. key = PBKDF2(passphrase, salt)
3. For each chunk:
   a. iv = chunk[0:12]
   b. ciphertext = chunk[12:]
   c. plaintext = AES-GCM-Open(key, iv, ciphertext)
   d. If compressed: decompress(plaintext)
4. Concatenate all decrypted chunks → original file
```

## Appendix B: Compression Flag

Since compression is decided per-chunk, the server needs to know which chunks were compressed for backward compatibility and metadata.

**Option A (Recommended): Compression flag in chunk metadata**

```sql
ALTER TABLE chunks ADD COLUMN compressed BOOLEAN DEFAULT false;
```

**Option B: Compression flag in chunk header**

```
Chunk format: [1B flags][12B IV][ciphertext + 16B tag]
Flags byte: bit 0 = compressed (0=no, 1=yes)
```

Option A is cleaner — the server already stores per-chunk metadata.

## Appendix C: Passphrase Verification Without Decryption

To verify a passphrase is correct without downloading and decrypting a full file:

```
During upload:
  verification_tag = HMAC-SHA256(key, "zpush-verify")
  Store verification_tag in file metadata

During download:
  Derive key from passphrase + salt
  computed_tag = HMAC-SHA256(key, "zpush-verify")
  If computed_tag != stored verification_tag → wrong passphrase
  Else → proceed with download
```

This saves bandwidth — wrong passphrase is caught before downloading any chunks.
