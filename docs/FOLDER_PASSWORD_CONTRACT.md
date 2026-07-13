# FOLDER_PASSWORD_CONTRACT.md — exact, code-grounded signatures

Scout reference for the per-folder-password build. Every signature below was read from the
current source (paths absolute from repo root `app/backend` / `app/frontend`). Build agents:
trust these names/types verbatim; do NOT re-guess.

================================================================================
## BACKEND (Go — module `github.com/zcrypt/zcrypt`)
================================================================================

### Schema + migrations — `index/schema.go`, `index/db.go`
- The ENTIRE schema is ONE Go raw-string const `schemaSQL` in `index/schema.go` (lines 3–504).
  There is no per-version migration framework: a `schema_migrations(version, applied_at)` table
  exists but is unused. Migrations are appended to the same string as idempotent
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
- Applied in `index/db.go`: `Open()` calls `db.runMigrations(ctx)` which runs `db.pool.Exec(ctx, schemaSQL)`
  in ONE batch on every boot (line 54-61). So adding a new `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  line at the end of `schemaSQL` is the whole migration. Optional non-critical stuff goes in
  `applyOptionalExtensions` (separate, failure-tolerant) — do NOT put the folder columns there.
- **folders table** (`index/schema.go` lines 489–498):
  ```sql
  CREATE TABLE IF NOT EXISTS folders (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id      UUID REFERENCES folders(id) ON DELETE CASCADE,   -- NULL = root
      encrypted_name TEXT NOT NULL,                                   -- client-encrypted base64
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at     TIMESTAMPTZ                                      -- non-null = trashed
  );
  ```
  ADD: `ALTER TABLE folders ADD COLUMN IF NOT EXISTS pw_salt TEXT;` and
       `ALTER TABLE folders ADD COLUMN IF NOT EXISTS pw_verifier TEXT;` (both nullable, no default).
- **files table** salt + wrapped CEK columns (`index/schema.go` lines 48–62, 216):
  - `salt        BYTEA NOT NULL`            ← per-file salt (32 raw bytes; NOT base64 in DB)
  - `wrapped_cek TEXT  NOT NULL DEFAULT ''` ← base64 envelope-wrapped CEK ('' = legacy file)
  - The re-key endpoint updates ONLY these two columns. Note `salt` is BYTEA: a re-key handler
    must base64-decode the incoming salt to `[]byte` (32 bytes) exactly like upload init does.

### Where SALT + WRAPPED_CEK are written / read
- **Written (upload init)** — `cmd/upload.go` `HandleUploadInit` (line 57):
  - decodes `req.Salt` (base64) → `salt []byte`, requires `len(salt)==32` (lines 80-84).
  - builds `types.FileMetadata{ Salt: salt, WrappedCEK: req.WrappedCEK, ... Status:"uploading" }` (line 118).
  - persists via `s.db.InsertFile(ctx, userID, fileMeta)` (line 131).
  - `InsertFile` (`index/queries.go` line 12) INSERTs columns `... salt, iv, wrapped_cek, status`
    binding `f.Salt, f.IV, f.WrappedCEK, status`.
- **Read (file meta for decrypt)** — `cmd/download.go` `HandleGetFileMeta` (line 17, route `GET /api/files/{id}/meta`):
  - `file, _ := s.db.GetFileByID(ctx, userID, fileID)` then JSON-encodes a hand-built map (lines 34-46)
    including `"salt": base64.StdEncoding.EncodeToString(file.Salt)` and `"wrapped_cek": file.WrappedCEK`.
  - `GetFileByID` (`index/queries.go` line 86) selects `... salt, iv, wrapped_cek, status, created_at`
    scoped `WHERE id=$1 AND user_id=$2`. This is the ownership check for both meta + chunk routes.

### Folder query patterns — `index/folders_queries.go`
All methods are `func (db *DB) ...(ctx context.Context, userID string, ...)`, scope every statement by
`user_id`, wrap errors `fmt.Errorf("...: %w", err)`, use `db.pool.QueryRow/Query/Exec`. Existing:
- `CreateFolder(ctx, userID string, req types.FolderRequest) (*types.Folder, error)` — INSERT ... RETURNING (line 21).
- `ListFolders(ctx, userID string, parentID *string) ([]types.Folder, error)` — `SELECT id,user_id,parent_id,encrypted_name,created_at,deleted_at FROM folders WHERE user_id=$1 AND deleted_at IS NULL AND parent_id IS NOT DISTINCT FROM $2 ORDER BY created_at` (line 49). **This SELECT column list + the matching `rows.Scan(...)` (line 67) MUST be extended to include `pw_salt, pw_verifier`** (and `CreateFolder`'s RETURNING + scan too) once the Folder struct gains those fields.
- `RenameFolder(ctx, userID, folderID, encryptedName string) error` — `UPDATE folders SET encrypted_name=$3 WHERE id=$1 AND user_id=$2` (line 81). Mirror this exact shape for new updaters.
- `MoveFolder(ctx, userID, folderID string, newParentID *string) error` (line 96) — guards self-move; TODO note re: descendant cycle.
- `SoftDeleteFolder(ctx, userID, folderID string) error` (line 114) — recursive-CTE subtree soft-delete in a tx.
- `MoveFile(ctx, userID, fileID string, folderID *string) error` (line 157) — `UPDATE files SET folder_id=$3 WHERE id=$1 AND user_id=$2`.
- **NEW methods to add here (follow RenameFolder shape):**
  - `SetFolderPassword(ctx, userID, folderID, pwSalt, pwVerifier string) error` → `UPDATE folders SET pw_salt=$3, pw_verifier=$4 WHERE id=$1 AND user_id=$2`.
  - `RemoveFolderPassword(ctx, userID, folderID string) error` → `UPDATE folders SET pw_salt=NULL, pw_verifier=NULL WHERE id=$1 AND user_id=$2`.
- **NEW file re-key method (put in `index/queries.go` near `GetFileByID`):**
  - `UpdateFileKey(ctx, userID, fileID string, salt []byte, wrappedCek string) error` → `UPDATE files SET salt=$3, wrapped_cek=$4 WHERE id=$1 AND user_id=$2`. `salt` is BYTEA so pass `[]byte` (decode base64 in the handler).

### Handler patterns — `cmd/folders.go` (+ `cmd/auth.go` audit)
Every handler is `func (s *Server) HandleX(w http.ResponseWriter, r *http.Request)`:
- `ctx := r.Context()`; `userID := GetUserID(r)` (`cmd/auth_middleware.go` line 102 — set by `AuthMiddleware`).
- path param via `r.PathValue("id")`; body via `json.NewDecoder(r.Body).Decode(&req)` into a `types.*Request`.
- error JSON: `http.Error(w, `{"error":"..."}`, http.Status...)`; on `db` error `log.Printf("...: %v", err)` then 500.
- success JSON: `w.Header().Set("Content-Type","application/json")` then `json.NewEncoder(w).Encode(...)`.
  Common success body for mutations: `map[string]bool{"success": true}`.
- **Audit** (`cmd/auth.go` line 22): `s.audit(r, &userID, "event_type", map[string]interface{}{"folder_id": folderID})`.
  Async-persists + emits SSE. `HandleDeleteFolder` (line 130) and `HandleRestoreFile` (line 193) already audit;
  the existing create/rename/move folder handlers do NOT audit. New password endpoints SHOULD audit
  (e.g. `"folder_password_set"`, `"folder_password_remove"`, `"file_rekey"`) — never log salt/verifier/keys.
- New handlers to add in `cmd/folders.go` (or `cmd/files.go`):
  - `HandleSetFolderPassword` — `POST /api/folders/{id}/password`, body `{ pw_salt, pw_verifier string }`,
    validate non-empty, call `s.db.SetFolderPassword`, audit, return `{"success":true}`.
  - `HandleRemoveFolderPassword` — `DELETE /api/folders/{id}/password`, call `s.db.RemoveFolderPassword`.
  - `HandleRekeyFile` — `PUT /api/files/{id}/rekey`, body `{ salt, wrapped_cek string }`,
    base64-decode `salt` → 32 bytes (reuse upload-init validation), call `s.db.UpdateFileKey`, audit.

### Route registration — `cmd/server.go` `RegisterRoutes` (LIVE)
- THE LIVE ROUTER IS `cmd/server.go`: `RegisterRoutes` builds the mux and registers
  every route, and `main.go` calls it at boot. **Register new routes there** —
  `main.go` itself registers no `HandleFunc`. (Historical note: an earlier build
  registered routes inline in `main.go`; that is no longer the boot path.)
- `maxJSON` wraps a handler with the JSON body-size limit (`cmd.MaxBodyMiddleware(1<<20, h)`).
- Existing folder/file-move routes follow the pattern `mux.HandleFunc("<METHOD> /api/...", maxJSON(server.AuthMiddleware(server.HandleX)))`:
  ```go
  mux.HandleFunc("GET /api/folders",            server.AuthMiddleware(server.HandleListFolders))
  mux.HandleFunc("POST /api/folders",           maxJSON(server.AuthMiddleware(server.HandleCreateFolder)))
  mux.HandleFunc("PATCH /api/folders/{id}",     maxJSON(server.AuthMiddleware(server.HandleRenameFolder)))
  mux.HandleFunc("PATCH /api/folders/{id}/move",maxJSON(server.AuthMiddleware(server.HandleMoveFolder)))
  mux.HandleFunc("DELETE /api/folders/{id}",    server.AuthMiddleware(server.HandleDeleteFolder))
  mux.HandleFunc("PATCH /api/files/{id}/move",  maxJSON(server.AuthMiddleware(server.HandleMoveFile)))
  ```
  ADD (same block): `POST /api/folders/{id}/password` (maxJSON), `DELETE /api/folders/{id}/password`,
  `PUT /api/files/{id}/rekey` (maxJSON) — all wrapped in `server.AuthMiddleware`.

### Folder struct — `types/types.go` (lines 570–578)
```go
type Folder struct {
    ID            string  `json:"id"`
    UserID        string  `json:"user_id"`
    ParentID      *string `json:"parent_id,omitempty"`   // nil = root
    EncryptedName string  `json:"encrypted_name"`        // opaque base64
    CreatedAt     string  `json:"created_at"`            // RFC3339 string, not time.Time
    DeletedAt     *string `json:"deleted_at,omitempty"`  // non-nil = trashed
}
```
ADD: `PwSalt *string \`json:"pw_salt,omitempty"\`` and `PwVerifier *string \`json:"pw_verifier,omitempty"\``
(pointers → SQL NULL maps to nil → omitted from JSON when unset). `FolderRequest` (line 581) is unchanged.
Add a small request struct for the password endpoint, e.g.
`type FolderPasswordRequest struct { PwSalt string \`json:"pw_salt"\`; PwVerifier string \`json:"pw_verifier"\` }`
and `type FileRekeyRequest struct { Salt string \`json:"salt"\`; WrappedCEK string \`json:"wrapped_cek"\` }`.

================================================================================
## FRONTEND (Next.js / TypeScript)
================================================================================

### `lib/crypto.ts` — EXACT signatures (all real)
```ts
export function generateSalt(): Uint8Array                                   // 32 random bytes
export async function deriveKeyBytes(passphrase: string, salt: Uint8Array): Promise<ArrayBuffer>  // PBKDF2-SHA256 600k → 32B KEK
export function generateCEK(): Uint8Array                                     // 32 random bytes
export async function wrapKey(kekBytes: ArrayBuffer, cek: Uint8Array): Promise<Uint8Array>         // = encryptChunk; [12B IV||ct||16B tag]
export async function unwrapKey(kekBytes: ArrayBuffer, wrapped: Uint8Array): Promise<Uint8Array>   // = decryptChunk
export async function encryptChunk(keyBytes: ArrayBuffer, plaintext: Uint8Array): Promise<Uint8Array>
export async function decryptChunk(keyBytes: ArrayBuffer, data: Uint8Array): Promise<Uint8Array>
export async function resolveFileKey(passphrase: string, salt: Uint8Array, wrappedCek?: string | null): Promise<ArrayBuffer>
export function toBase64(data: Uint8Array): string
export function fromBase64(b64: string): Uint8Array
export class IncorrectPassphraseError extends Error          // thrown by resolveFileKey on AES-GCM unwrap failure (wrong pass)
export async function sha256Hex(data: Uint8Array): Promise<string>
export async function sha256File(file: File): Promise<string>
export const CHUNK_SIZE = 10 * 1024 * 1024
```
KEY FACTS: `resolveFileKey` derives KEK=`deriveKeyBytes(pass, salt)`, then for envelope files unwraps the
CEK and returns the **CEK** (legacy/no-wrap → returns the KEK). `wrapKey`/`unwrapKey` are thin aliases of
`encryptChunk`/`decryptChunk`. The verifier scheme in the spec composes these directly: derive KEK from
`pw_salt`, `encryptChunk(KEK, utf8(const))` → verifier; verify by `decryptChunk(KEK, fromBase64(verifier))`
and compare. No new primitive needed.

### EVERY `resolveFileKey` call site (file:line) — each fetches meta, does `salt=fromBase64(meta.salt)`,
then `resolveFileKey(passphrase, salt, meta.wrapped_cek)`. To route folder passwords, the `passphrase`
arg at each site becomes `passwordForFile(file)` (vault pass for unprotected; folder pass for protected):
- `lib/download-session.ts:58` — `downloadAndDecryptFile(fileId, passphrase, options?)` (defined line 36). Single-file download.
- `lib/bulk-download.ts:64` — `downloadAsZip(files: BulkDownloadFile[], passphrase, options?)` (line 36). ZIP path; loops files, each may need a different password.
- `hooks/useThumbnail.ts:132` — inside `decryptFileToBlob(fileId, passphrase)` (line 129), called by `batchLoadThumbnails(files, passphrase)` (line 176) + `useThumbnail(fileId, filename)` hook (line 197). Grid thumbnails.
- `hooks/useVaultActions.ts:229` — inside `startPreview(filename, passphrase)` (line 214); dashboard preview path. (Download path in same hook is `handleDownload` line 172 → `storeStartDownload(...)` → download store → `download-session.ts`.)
- `components/ui/share-modal.tsx:103` — share creation (recovers CEK to re-wrap under a share key).
- `components/files/details-drawer.tsx:177` — share creation from the details drawer (same re-wrap pattern).
NOTE share-modal/details-drawer also show the **rewrap pattern to copy for re-keying**: `generateCEK()` is NOT
re-generated for re-key — instead recover the existing CEK via `resolveFileKey`, then `wrapKey(newKekBuf, cek)`
under the destination password (with a new salt). See §upload below for the wrap call shape.

### Upload store CEK-generate + wrap + initUpload — `store/upload.ts`
- Inside `uploadOneFile(file, id, opts)` FRESH branch (lines 248–271):
  ```ts
  const salt = generateSalt();
  const kekBytes = await deriveKeyBytes(passphrase, salt);   // ← passphrase enters HERE (opts.passphrase)
  const cek = generateCEK();
  const wrappedCek = await wrapKey(kekBytes, cek);
  cekBytes = cek.buffer.slice(0) as ArrayBuffer;             // CEK reused for every chunk + resume
  ...
  session = await initUpload({ filename, original_size, sha256, salt: toBase64(salt),
                               wrapped_cek: toBase64(wrappedCek), chunk_count, platform });
  ```
- `passphrase` is `opts.passphrase`, threaded from `startUpload(files, passphrase, platform?, maxConcurrent?, onRefresh?, hfConnected?)`
  (line 544) → `uploadOneFile(file, id, { passphrase, platform, profile, onRefresh })` (line 590). Also `retryUpload(id, passphrase)`
  (line 625) and `resumeUpload(id, passphrase)` (line 666) re-pass it. **To upload into a protected folder:**
  the caller (`useVaultActions.handleFilesSelected` → `startUpload`) must pass the FOLDER password as `passphrase`
  when `currentFolderId` is protected; the wrap then uses `deriveKeyBytes(folderPw, fileSalt)`. `initUpload`'s
  request type lives in `lib/upload-session.ts` (`UploadInitRequest`-shaped; matches backend `types.UploadInitRequest`).
  `initUpload` does NOT currently send `folder_id` — files are moved into folders separately via `moveFile`.

### `hooks/useFolders.ts` + `store/folders.ts`
- `store/folders.ts` `useFolderStore` (zustand): `currentFolderId: string|null`, `breadcrumb: Crumb[]`
  (`Crumb = {id:string|null; name:string}`, ROOT = `{id:null,name:"My Vault"}`), `folders: Folder[]`,
  `decryptedNames`, `loading`. Nav: `setCurrentFolder(id, name)`, `pushCrumb`, `navigateToCrumb(index)`, `reset()`.
  `setCurrentFolder(id,name)` appends/truncates the breadcrumb trail. (Folder PASSWORD cache does NOT live here —
  add a separate `store/folder-passwords.ts`, see below.)
- `hooks/useFolders.ts` exports `useFolders()` returning:
  `{ folders: DecryptedFolder[], loading, locked, refresh, createFolder, renameFolder, deleteFolder, openFolder, navigateToCrumb, currentFolderId, breadcrumb }`.
  `export interface DecryptedFolder extends Folder { name: string }` (line 16). So once `Folder` gains
  `pw_salt`/`pw_verifier`, `DecryptedFolder` inherits them; add a derived `protected: boolean` (= `pw_salt != null`)
  in `refresh()`'s mapping (line 60: `raw.map(async (f) => ({ ...f, name: ..., protected: f.pw_salt != null }))`).
- Folder list fetch + decrypt (`refresh`, line 52): `raw = await listFolders(currentFolderId)` →
  `setFoldersStore(raw)` → derive name key via `getNameKey()` (PBKDF2 over **vault passphrase**, cached in a ref) →
  `decryptNameSafe(f.encrypted_name, key)`. Names use the VAULT passphrase + `lib/name-crypto.ts`
  (`deriveNameKey(passphrase, userId)`, `decryptNameSafe(b64, key)`), NOT the folder password — so a protected
  folder's NAME stays browsable once the vault is unlocked; only its FILES need the folder password.

### `lib/api.ts` folder + file fn patterns (all via `request<T>(path, options?)`, lines 148–171)
```ts
const JSON_HEADERS = { "Content-Type": "application/json" } as const;
export function listFolders(parentId?: string | null): Promise<Folder[]>      // GET /api/folders?parent_id=
export function createFolder(data: FolderRequest): Promise<Folder>            // POST
export function renameFolder(id, encryptedName: string): Promise<{success:boolean}>      // PATCH /api/folders/{id}
export function moveFolder(id, parentId: string|null): Promise<{success:boolean}>        // PATCH /api/folders/{id}/move
export function deleteFolder(id: string): Promise<{success:boolean}>                      // DELETE /api/folders/{id}
export function moveFile(id, folderId: string|null): Promise<{success:boolean}>          // PATCH /api/files/{id}/move
export function getFileMeta(fileId: string): Promise<FileMetaResponse>                    // GET /api/files/{id}/meta
```
`FileMetaResponse` (line 74) includes `salt: string` (base64) + `wrapped_cek?: string`.
**ADD (mirror the above one-liners):**
```ts
export function setFolderPassword(id: string, pw_salt: string, pw_verifier: string): Promise<{success:boolean}>
  // POST /api/folders/${id}/password, JSON_HEADERS, body {pw_salt, pw_verifier}
export function removeFolderPassword(id: string): Promise<{success:boolean}>             // DELETE /api/folders/${id}/password
export function rekeyFile(id: string, salt: string, wrapped_cek: string): Promise<{success:boolean}>
  // PUT /api/files/${id}/rekey, JSON_HEADERS, body {salt, wrapped_cek}  (salt is base64)
```

### Folder type — `types/index.ts` (lines 19–26)
```ts
export interface Folder {
  id: string; user_id: string; parent_id?: string | null;
  encrypted_name: string; created_at: string; deleted_at?: string | null;
}
```
ADD: `pw_salt?: string | null;  pw_verifier?: string | null;`. `FileMetadata` (line 1) already has
`folder_id?: string | null` (used by the explorer to scope files to the current folder). `FolderRequest`
(line 28) = `{ encrypted_name; parent_id?: string|null }` — unchanged.

### `MoveToFolderDialog` props — `components/files/move-to-folder-dialog.tsx` (line 22)
```ts
interface MoveToFolderDialogProps { open: boolean; fileId: string | null; onClose: () => void; onMoved?: () => void; }
```
Lazy nested tree: `fetchChildren(parentId)` calls `listFolders(parentId)` + decrypts names with a `keyRef`
(vault-pass name key). `handleMove` (line 118) calls `moveFile(fileId, selected)`. **Spec C1 (move a FOLDER):**
extend props to accept what's being moved (e.g. add `folderId?: string | null` or a discriminated
`item: {kind:'file'|'folder', id}`); when moving a folder, call `moveFolder(item.id, dest)` and **reject dropping
into itself/descendant** (reuse `canDrop` from `hooks/useDragMove.ts`, already used by the explorer DnD).

### Explorer kebab + open-folder navigation — `components/files/explorer/*` + `vault-explorer.tsx`
- `vault-explorer.tsx` `<VaultExplorer>` owns folders via `useFolders()` (line 179) and passes per-entry
  callbacks to rows/cards: `onOpenFolder={openFolder}`, `onRenameFolder={startRename}`, `onDeleteFolder={setDeleteTarget}`
  (lines 718-720 list, 743-745 grid). `openFolder(folder)` → `setCurrentFolder(folder.id, folder.name)` (store) →
  navigation is just changing `currentFolderId`; files are re-filtered client-side by
  `files.filter(f => (f.folder_id ?? null) === currentFolderId)` (line 220). NO server fetch per open.
- The FOLDER kebab is in `components/files/explorer/explorer-row.tsx` `FolderRow` (lines 105-187) — a
  `<DropdownMenu>` with `DropdownMenuItem`s: **Open** (`onOpenFolder`), **Rename** (`onRenameFolder`),
  separator, **Delete** (`onDeleteFolder`). `explorer-card.tsx` `FolderCard` mirrors it (grid view, same 3 items
  + same props at lines 57-59 / 127-139). **To add "Protect with password…" / "Remove password…" + the lock badge:**
  add `onProtectFolder?` / `onRemoveFolderPassword?` to `ExplorerRowProps`/`FolderCardProps` and to
  `vault-explorer`'s wiring; gate the menu item on `folder.protected`. The lock badge goes on the
  `<Folder className.../>` icon container (row line 144 / card equivalent). Use only `@/lib/icons` glyphs
  (`Lock` is already imported in vault-explorer line 78; add a key/lock glyph from the barrel for the badge).
- FILE kebab (`FileRow`, explorer-row.tsx lines 290-319): Preview / Download / Share / **Move to folder**
  (`actions.onMoveRequest?.(file.id)`, line 306-309, only when `onMoveRequest` set) / Delete. `ExplorerActions`
  type in `components/files/explorer/types.ts` (line 18). The page (dashboard) supplies these via `useVaultActions`.

### Vault passphrase cache to MIRROR — `store/passphrase.ts` + `hooks/useVaultLock.ts`
- `store/passphrase.ts` `usePassphraseStore`: `{ cachedPassphrase: string|null; cacheUntil: number|null;
  rememberByDefault: boolean; setPassphrase(pass, ttlMinutes=15); getPassphrase(): string|null; clear();
  getRemainingMinutes() }`. Single value + single `setTimeout` auto-clear at TTL; `getPassphrase` lazily
  expires. **In-memory only, never persisted.**
- `hooks/useVaultLock.ts` `useVaultLock()` returns `{ unlocked, remainingMinutes, remainingSeconds, unlock,
  lock, withPassphrase, modalProps, setError, reopen }`. **`withPassphrase(action)` (line 136) is the ONE
  unlock entry point:** runs `action(cachedPass)` immediately if unlocked, else opens the `PassphraseModal`
  (via `modalProps`) and runs the pending action on confirm. Every decrypt path uses it (see useVaultActions
  `handleDownload`/`startPreview`/`handleBulkDownload`/`handleFilesSelected` all call `vault.withPassphrase(...)`).
- **MIRROR for folder passwords:** new `store/folder-passwords.ts` = a `Map<folderId,string>` cache
  with the SAME TTL/auto-clear/lazy-expire shape but keyed by folderId:
  `set(folderId, pw, ttlMinutes=15)`, `get(folderId): string|null`, `clear(folderId)`, `clearAll()`. Then a
  small unlock-modal hook mirroring `useVaultLock.withPassphrase` but per-folder, verifying via
  `verifyFolderPassword(pw, pw_salt, pw_verifier)` before caching. `passwordForFile(file)` (new helper in
  `useVaultActions.ts` or its own hook) returns folder-pass for a protected `file.folder_id`, else vault pass.
