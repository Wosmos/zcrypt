# Envelope Encryption — Design (Phase 2)

Status: **IMPLEMENTED** (see "What actually shipped" below).

> **What actually shipped (differs from the original proposal):** The project is
> in dev and existing files are disposable, so the migration was dropped
> entirely — there is **no `crypto_version` column and no v1→v2 upgrade path**.
> Every new upload is envelope-encrypted (v2). Files uploaded before this change
> will simply fail to decrypt and should be re-uploaded. The `resolveFileKey`
> helper still falls back to the passphrase-derived key when `wrapped_cek` is
> empty, so the read path is forward/backward tolerant, but no automatic upgrade
> happens. The crypto model, wire formats, and sharing design below are accurate
> as implemented; the "crypto_version" and "v1→v2 upgrade" sections describe the
> original plan and were **not** built.

Original decision basis: versioned formats + lazy re-wrap; full re-encrypt on upgrade.

## Problem

Today a file's content is encrypted directly with a key derived from the user's
master passphrase:

```
key = PBKDF2-SHA256(passphrase, per-file salt, 600k)
chunk = AES-256-GCM(key, plaintext)        // lib/crypto.ts encryptChunk
```

The salt is per-file but the *secret input* is the same passphrase for every
file. There is no per-file content key, so:

- Sharing a file requires handing over the passphrase that decrypts the user's
  **entire** vault (see `share-modal.tsx` warning, `app/s/[token]/page.tsx`).
- Shared Vaults can't give members a key at all.

`/send` and `/pad` already do this correctly: random per-item key in the URL
fragment (`send-tool.tsx`, `pad-tool.tsx`). We extend that pattern to files.

## Target model (v2): envelope encryption

```
CEK            = 32 random bytes                       // per file, NOT derived
chunk          = AES-256-GCM(CEK, plaintext)           // content keyed to CEK
KEK_pass       = PBKDF2-SHA256(passphrase, salt, 600k) // unchanged derivation
wrapped_cek    = AES-256-GCM(KEK_pass, CEK)            // [12B IV || ct || 16B tag]
```

- The user decrypts by deriving `KEK_pass` from their passphrase, unwrapping
  `wrapped_cek` to recover the CEK, then decrypting chunks with the CEK.
- **The server stores `wrapped_cek` and `salt`. It never sees the passphrase,
  the KEK, or the CEK.** Zero-knowledge preserved.

### Sharing (v2 files only)

```
shareKey       = 32 random bytes                       // per share
share_wrapped_cek = AES-256-GCM(shareKey, CEK)         // stored on the share row
link           = https://host/s/{token}#{base64url(shareKey)}
```

- The `shareKey` lives **only in the URL fragment** (`#…`), which browsers never
  send to the server. The server stores only `share_wrapped_cek`.
- Recipient: read `shareKey` from `location.hash` → unwrap `share_wrapped_cek`
  → CEK → decrypt chunks. **No passphrase prompt.**
- Optional share password (existing `password_hash`) stays as an access gate on
  the chunk-download endpoint; it is independent of the crypto.

### Shared Vaults (v2 files only)

For each member, wrap the file's CEK under a member-specific key. Two viable
sub-designs — to be settled when we build that feature, not now:
- (a) Symmetric: member holds a vault key out-of-band (like a share link). Simple.
- (b) Asymmetric: member has an ECDH/RSA keypair; owner wraps CEK to their public
  key. True multi-recipient, no shared secret. Heavier (needs a key directory).
This doc covers single-file shares; vaults reuse the same `wrap`/`unwrap`.

## Wire formats

`wrapped_cek` and `share_wrapped_cek` reuse the existing chunk envelope so we can
reuse `encryptChunk`/`decryptChunk` verbatim:

```
[12B random IV][ AES-256-GCM ciphertext of the 32B CEK ][16B auth tag]  = 60 bytes
```

Stored base64 in the DB / JSON. No new primitive, no new code path in crypto core.

## crypto_version

Add `crypto_version SMALLINT NOT NULL DEFAULT 1` to `files`.

- `1` = legacy: content keyed by `PBKDF2(passphrase, salt)` directly. No CEK.
- `2` = envelope: content keyed by random CEK; `wrapped_cek` present.

New uploads write `crypto_version = 2`. Old rows stay `1`.

## Schema changes (all `ALTER TABLE … IF NOT EXISTS`, additive)

```sql
ALTER TABLE files  ADD COLUMN IF NOT EXISTS crypto_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE files  ADD COLUMN IF NOT EXISTS wrapped_cek    TEXT    NOT NULL DEFAULT ''; -- base64, v2 only
ALTER TABLE shares ADD COLUMN IF NOT EXISTS wrapped_cek    TEXT    NOT NULL DEFAULT ''; -- base64 share_wrapped_cek
```

No column is dropped; v1 continues to work with empty `wrapped_cek`.

## Decryption path (client) — version-aware

```
meta = getFileMeta(id)              // now includes crypto_version, wrapped_cek
KEK  = deriveKeyBytes(passphrase, salt)
if meta.crypto_version === 2:
    CEK = decryptChunk(KEK, fromBase64(meta.wrapped_cek))   // unwrap
    key = CEK
else:
    key = KEK                                               // legacy direct
for each chunk: decryptChunk(key, chunkBytes)
```

This single helper (`resolveFileKey(meta, passphrase)`) replaces the inline
`deriveKeyBytes` call in **every** read path:
- `lib/download-session.ts`
- `lib/bulk-download.ts`
- `hooks/useThumbnail.ts`
- `app/(app)/dashboard/page.tsx` (preview)
- `app/s/[token]/page.tsx` + `lib/share-download.ts` (share uses shareKey instead of passphrase)

## Upload path (client) — v2

In `store/upload.ts` (currently lines ~256-259):
```
salt = generateSalt()
KEK  = deriveKeyBytes(passphrase, salt)
CEK  = crypto.getRandomValues(new Uint8Array(32))
wrapped_cek = encryptChunk(KEK, CEK)            // 60 bytes, base64
// encrypt every chunk with CEK (was: with KEK)
// send salt + base64(wrapped_cek) + crypto_version=2 in upload init
```

The crypto worker (`workers/crypto-worker.ts`) takes the CEK instead of the
derived key. Compression stays identical (`ZstdStream`).

## Share creation (client + backend)

Client (`share-modal.tsx`):
```
shareKey = crypto.getRandomValues(new Uint8Array(32))
// need the file's CEK: unwrap wrapped_cek with the user's passphrase first
CEK = decryptChunk(KEK, fromBase64(file.wrapped_cek))
share_wrapped_cek = encryptChunk(shareKey, CEK)
POST /api/shares { file_id, wrapped_cek: base64(share_wrapped_cek), ... }
link = `${origin}/s/${token}#${base64url(shareKey)}`
```

- Creating a share now requires the passphrase in the browser (to get the CEK).
  That's fine — the owner is logged in and has it cached (`store/passphrase.ts`).
- **A v1 file cannot be shared until upgraded** (it has no CEK). The share button
  on a v1 file triggers the upgrade flow (below) first.

Backend (`cmd/shares.go` `HandleCreateShare`): persist `wrapped_cek`. The share
meta endpoint returns it; the recipient unwraps with the fragment key.

## v1 → v2 upgrade (full re-encrypt, lazy)

Triggered when: a user opens a v1 file with their passphrase (background upgrade),
or explicitly when they try to share a v1 file (must upgrade first).

```
1. Download + decrypt all chunks with KEK_pass (legacy path) → plaintext.
2. Generate CEK. Re-encrypt chunks with CEK.
3. wrapped_cek = encryptChunk(KEK_pass, CEK).
4. Re-upload chunks (new upload session, replaces remote chunks), set
   crypto_version=2 + wrapped_cek on the file, swap chunk rows atomically.
5. Old remote chunks queued for deletion (existing pending_deletions path).
```

This is heavy (re-uploads the file) but it's the only way to make legacy content
truly shareable, and it's amortized: only files that are opened/shared upgrade.
Files never touched stay v1 and keep working forever.

**Open question for review:** background-on-open upgrade could surprise users by
re-uploading large files unprompted. Safer default = upgrade **only on explicit
share** (the user asked to share, so the cost is expected). Recommend that.

## What does NOT change

- PBKDF2 params, salt size, AES-GCM, chunk wire format, SHA-256 verification.
- The server still relays opaque ciphertext and only SHA-256-verifies chunks.
- `/send` and `/pad` (already correct).
- Account password / auth (separate from the passphrase).

## Risk / rollout

- All schema changes additive; deploy backend first (tolerates v1 and v2), then
  frontend. No downtime.
- v1 read path is preserved indefinitely — no file becomes unreadable.
- The breaking-ish change is only that **new** files are v2; old clients reading
  a v2 file would need the new unwrap logic, so ship frontend before announcing
  sharing.

## Touch list (files)

Backend:
- `index/schema.go` — 3 ALTER statements
- `index/queries.go` — file insert/select include crypto_version, wrapped_cek
- `index/share_queries.go` (or wherever shares live) — persist/return wrapped_cek
- `cmd/upload.go` — accept crypto_version + wrapped_cek on init
- `cmd/shares.go` — accept/return wrapped_cek
- `cmd/download.go` — return crypto_version + wrapped_cek in file meta
- `types/types.go` — File.CryptoVersion, File.WrappedCEK, ShareLink.WrappedCEK

Frontend:
- `lib/crypto.ts` — add `generateCEK`, `wrapKey`, `unwrapKey` (thin wrappers over
  encryptChunk/decryptChunk), `resolveFileKey(meta, passphrase)`
- `store/upload.ts` — generate CEK, wrap, send v2
- `workers/crypto-worker.ts` — encrypt with CEK
- `lib/download-session.ts`, `lib/bulk-download.ts`, `hooks/useThumbnail.ts`,
  `app/(app)/dashboard/page.tsx` — use resolveFileKey
- `components/ui/share-modal.tsx` — generate shareKey, wrap CEK, fragment link
- `app/s/[token]/page.tsx`, `lib/share-download.ts` — read fragment key, unwrap,
  drop passphrase input
- `types/index.ts` — crypto_version, wrapped_cek on file + share types
```
