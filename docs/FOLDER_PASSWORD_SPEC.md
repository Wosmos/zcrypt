# Per-Folder Password Encryption — Build Spec (zero-knowledge)

Optional, real cryptographic password protection on a folder. Reuses the EXISTING per-file
envelope primitive (random CEK wrapped by a PBKDF2-derived KEK) — the ONLY thing that changes
for a protected folder's files is *which password derives the KEK*. No new cipher, no new
key-derivation. Build agents read this + FOLDER_PASSWORD_CONTRACT.md (scout's exact signatures).

## 0. Guardrails (NON-NEGOTIABLE)
- **Zero-knowledge:** the folder password NEVER leaves the device, is NEVER sent to the server, NEVER logged. The server stores only opaque base64 blobs (salt, verifier, wrapped CEKs). All authed calls via the existing api layer.
- **Shared prod DB:** the backend migration MUST be **additive, nullable columns only** (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). No drops, no NOT NULL, no backfills that touch existing rows. It applies to the production Neon DB on the user's next backend restart.
- Backend: standard Go, `go build` + `go vet` clean. Frontend: `--color-*` tokens only, `"use client"`, icons from `@/lib/icons`, motion reduced-motion-safe, `bun run typecheck`/`lint` clean. Never touch app/(marketing) or app/(auth). globals.css/tailwind.config.js frozen.
- Do NOT weaken the existing single-vault-passphrase model — this is purely additive: unprotected files keep using the vault passphrase exactly as today.

## 1. Crypto model (reuse existing `lib/crypto.ts`)
Existing primitives (confirm exact names in the contract): `deriveKeyBytes(passphrase, salt)` (PBKDF2-SHA256, 600k → 32-byte KEK), `generateSalt()`, `generateCEK()`, `wrapKey(kek, cek)`/`unwrapKey(kek, wrapped)`, `resolveFileKey(passphrase, salt, wrappedCek)`, `encryptChunk(key,data)`/`decryptChunk(key,data)`, `toBase64`/`fromBase64`.

**Folder protection record (client-computed, server stores opaque):**
- `pw_salt` = `generateSalt()` (base64) — random, per folder.
- `pw_verifier` = `toBase64(encryptChunk(KEK_pw, utf8("zcrypt-folder-verify-v1")))` where `KEK_pw = deriveKeyBytes(folderPassword, pw_salt)`.
  - Verify a typed password: derive `KEK_pw`, `decryptChunk(KEK_pw, fromBase64(pw_verifier))`, check the plaintext equals the constant. Failure ⇒ wrong password (no server round-trip, no decrypt of real files needed).
- A folder is "protected" iff `pw_salt != null`.

**Files inside a protected folder:** identical envelope to today, but the wrapping KEK is derived from the **folder password** + that file's OWN `salt` (every file already has its own salt): `KEK = deriveKeyBytes(folderPassword, fileSalt)`, store `wrapped_cek = wrapKey(KEK, cek)` and `salt = fileSalt`. Decrypt is the UNCHANGED `resolveFileKey(folderPassword, fileSalt, wrapped_cek)` — just pass the folder password instead of the vault passphrase. (So `pw_salt` is used ONLY for the verifier; per-file salts are unchanged.)

**Which password to use (client routing):** `passwordForFile(file)` = if `file.folder_id` is a protected folder → the cached **folder password** for that folder (prompt to unlock if not cached); else → the **vault passphrase**. This single helper feeds upload wrap, download, preview, thumbnail.

## 2. Backend (OWNER: backend agent — Go)
Files: `index/schema.go`, `index/folders_queries.go` (+ a file-key query in `index/queries.go`), `cmd/folders.go`, `cmd/files.go`/wherever file rows are updated, `main.go` (routes), `types/types.go`.
- **Schema (additive only):** add `pw_salt TEXT` and `pw_verifier TEXT` (both nullable) to the `folders` table via `ADD COLUMN IF NOT EXISTS`.
- **Folder list/read:** include `pw_salt` + `pw_verifier` (or expose `protected bool` + the two fields) so the client can prompt + verify. (NEVER returns anything secret — these are opaque.)
- **Set/replace folder password:** `POST /api/folders/{id}/password` body `{ pw_salt, pw_verifier }` (ownership-checked). Stores the two columns.
- **Remove folder password:** `DELETE /api/folders/{id}/password` → sets both columns NULL. (The CLIENT must re-key the folder's files back to the vault passphrase BEFORE calling this — see §3 unprotect flow.)
- **Re-key a file:** `PUT /api/files/{id}/rekey` body `{ salt, wrapped_cek }` (ownership-checked) → updates ONLY that file's `salt` + `wrapped_cek` columns (confirm exact column names in contract). The server never sees keys. Used when a file crosses a protection boundary.
- All endpoints: auth required, ownership enforced, audit-logged like the existing folder endpoints. Additive routes in `main.go`.

## 3. Frontend (OWNERS: crypto/data agent, then UI/integration agent)
### Crypto/data (new files; do not touch UI)
- `lib/folder-crypto.ts`: `deriveFolderPwSalt()=generateSalt()`, `makeFolderVerifier(password, pwSalt)`, `verifyFolderPassword(password, pwSalt, pwVerifier): Promise<boolean>`, and `rewrapFileKey(cek, newPassword, newSalt)` helpers — all thin wrappers over `lib/crypto.ts`. NO new crypto math beyond composing the existing primitives.
- `store/folder-passwords.ts`: a zustand cache `Map<folderId, password>` with a TTL mirroring the vault passphrase cache (`set(folderId, pw, ttl)`, `get(folderId)`, `clear(folderId)`, `clearAll()`). Folder passwords live ONLY here in memory — never persisted.
- `lib/api.ts` + `types/index.ts`: `setFolderPassword(id, pw_salt, pw_verifier)`, `removeFolderPassword(id)`, `rekeyFile(id, salt, wrapped_cek)`; extend `Folder` with `pw_salt?: string|null`, `pw_verifier?: string|null` (and a derived `protected` is fine in the hook). Extend `useFolders`/`DecryptedFolder` to expose `protected`.
- `passwordForFile(file)` resolver (in `hooks/useVaultActions.ts` or a small hook): returns the right password (vault vs folder), prompting via the relevant unlock modal when missing.

### UI / integration
- **Folder kebab:** add "Protect with password…" (when unprotected) and "Remove password…" (when protected) to the folder row/card kebab in the explorer. Lock badge on protected folders (a small key/lock glyph on the folder icon — this is allowed; it conveys real state, unlike the per-file glyph we removed).
- **Set-password dialog:** prompts for a new password (+ confirm). On submit: `pwSalt=generateSalt()`, `verifier=makeFolderVerifier(pw,pwSalt)`, `setFolderPassword(id,...)`. If the folder ALREADY has files (uploaded under the vault passphrase), re-key each to the new folder password (decrypt CEK with vault passphrase using each file's salt, rewrap under the folder password, `rekeyFile`). Requires the vault to be unlocked; if locked, run the vault unlock first. Show progress for the re-key sweep.
- **Open a protected folder:** prompt for its password via a dialog that VERIFIES with `verifyFolderPassword` before entering; on success cache it in `store/folder-passwords` (TTL) and navigate in. Re-uses the look of the existing PassphraseModal. Browsing the folder's file list (names) still works without the password if names are vault-encrypted — but DECRYPTING any file requires the folder password.
- **Upload into a protected folder:** the upload flow wraps CEKs with the folder password (route the right password into the existing upload path; prompt/unlock the folder first if needed).
- **Decrypt routing:** download, preview, thumbnail, bulk-download all go through `passwordForFile` so files in a protected folder use the folder password. Wrong-password → clear that folder's cache + re-prompt with an inline error (mirror the vault wrong-passphrase flow).
- **Move re-key (drag + "Move to folder"):** when a file crosses a protection boundary, re-key before/with the move: decrypt the CEK under the source password, rewrap under the destination password (new salt), `rekeyFile`, then `moveFile`. vault→protected, protected→vault, protected A→protected B all handled. If a needed password isn't unlocked, prompt for it first. Same-zone moves are unchanged (no re-key).
- **Unprotect flow:** "Remove password" re-keys every file in the folder back to the vault passphrase (needs both the folder password and vault unlocked), THEN calls `removeFolderPassword`.
- **Deferred a11y item C1, now in scope:** add a keyboard-reachable "Move to folder" to the FOLDER kebab (teach `MoveToFolderDialog` to accept a folder as the thing being moved, picking a destination folder; reject moving a folder into itself/descendant). This closes the DnD-only gap for folders.

## 4. UX principles (the user's explicit asks)
- Protection is OPTIONAL and OFF by default. Plain folders/files behave exactly as today — one vault unlock, no extra prompts.
- Keep it EASY: a protected folder asks for its password once on open (cached with a visible TTL, like the vault). Don't nag per file.
- Clear, honest messaging: protecting a non-empty folder re-keys its files (show progress); removing protection re-keys back. Wrong password is a clean inline error, never a silent failure.

## 5. Review focus
- **Crypto/ZK correctness (critical):** no password/CEK to server or logs; verifier scheme sound; re-key never loses data (a file is only updated after the new wrapped_cek is proven decryptable); boundary moves can't strand a file under a key the user no longer has.
- Behavior preservation: unprotected flows untouched; vault unlock unchanged.
- Edge cases: protect/unprotect a non-empty folder, move across boundaries while one side is locked, wrong password, nested protected folders.
