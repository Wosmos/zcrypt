# FEATURES_CONTRACT.md

Code-grounded reference for the zcrypt frontend vault build. Every signature below is
copied from the real source — no guesses. Paths are relative to `app/frontend/`.

---

## 1. Decrypt-to-blob pipeline

### `hooks/useVaultActions.ts` — `startPreview`

Imports used by the preview path (top of file):

```ts
import { usePassphraseStore } from "@/store/passphrase";
import { IncorrectPassphraseError } from "@/lib/crypto";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { toast } from "@/store/toast";
import type { FileMetadata } from "@/types";
import type { UseFolderProtection } from "@/hooks/useFolderProtection";
```

`startPreview` is a `useCallback(async (filename: string) => {...}, [files, vault, openPreview, closePreview, folderProtection])`. FULL body:

```ts
const startPreview = useCallback(
  async (filename: string) => {
    const file = files.find((f) => f.original_name === filename);
    if (!file) return;

    openPreview(null, filename, file.original_size);

    try {
      // Resolve the right password (vault, or folder pass for a protected
      // folder — prompting/verifying if its password isn't cached).
      const passphrase = await folderProtection.passwordForFile(file);

      const { getFileMeta, getFileChunk } = await import("@/lib/api");
      const { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
      const { ZstdInit } = await import("@oneidentity/zstd-js/wasm");
      const zstd = await ZstdInit();

      const meta = await getFileMeta(file.id);
      const salt = fromBase64(meta.salt);
      const keyBytes = await resolveFileKey(passphrase, salt, meta.wrapped_cek);

      const chunks: Uint8Array[] = [];
      for (let i = 0; i < meta.chunk_count; i++) {
        const { data, compressed } = await getFileChunk(file.id, i);
        let plain = await decryptChunk(keyBytes, new Uint8Array(data));
        if (compressed && zstd) {
          // ZstdStream (not ZstdSimple): doesn't require frame content size.
          plain = zstd.ZstdStream.decompress(plain);
        }
        chunks.push(plain);
      }

      const totalSize = chunks.reduce((s, c) => s + c.byteLength, 0);
      const full = new Uint8Array(totalSize);
      let offset = 0;
      for (const c of chunks) {
        full.set(c, offset);
        offset += c.byteLength;
      }

      const hash = await sha256Hex(full);
      if (hash !== meta.sha256) throw new Error("File integrity check failed");

      const blob = new Blob([full], { type: "application/octet-stream" });
      openPreview(blob, filename, file.original_size);
    } catch (err) {
      closePreview();
      const msg = err instanceof Error ? err.message : "Preview failed";
      const looksLikeWrongKey =
        msg.toLowerCase().includes("decrypt") ||
        msg.toLowerCase().includes("passphrase") ||
        msg.toLowerCase().includes("cipher") ||
        err instanceof IncorrectPassphraseError;

      if (looksLikeWrongKey) {
        const fid = file.folder_id ?? null;
        if (fid && useFolderRegistry.getState().isProtected(fid)) {
          // Wrong FOLDER password → clear cache + re-prompt folder unlock, retry.
          folderProtection.clearFolderPassword(fid);
          folderProtection.withFolderPassword(fid, "this folder", () => {
            void startPreview(filename);
          });
        } else {
          // Wrong VAULT passphrase → re-lock, re-prompt the single vault modal, retry.
          vault.lock();
          vault.setError("Incorrect passphrase. Please try again.");
          vault.reopen(() => void startPreview(filename));
        }
      } else {
        toast.error(msg);
      }
    }
  },
  [files, vault, openPreview, closePreview, folderProtection]
);
```

Pipeline summary (in order):
1. `openPreview(null, filename, size)` opens the modal in a loading state.
2. **Passphrase** is obtained via `await folderProtection.passwordForFile(file)` — NOT read directly. This returns the vault passphrase for unprotected files, or the (cached/prompted+verified) folder password for protected-folder files.
3. **Dynamic imports**: `@/lib/api` (`getFileMeta`, `getFileChunk`), `@/lib/crypto` (`resolveFileKey`, `decryptChunk`, `sha256Hex`, `fromBase64`), and `@oneidentity/zstd-js/wasm` (`ZstdInit`). `const zstd = await ZstdInit();`
4. `meta = await getFileMeta(file.id)`; `salt = fromBase64(meta.salt)`; `keyBytes = await resolveFileKey(passphrase, salt, meta.wrapped_cek)` → raw `ArrayBuffer` CEK (or legacy KEK).
5. **Chunk loop** `for i in 0..meta.chunk_count`: `getFileChunk(file.id, i)` → `{ data: ArrayBuffer, compressed: boolean }`. `decryptChunk(keyBytes, new Uint8Array(data))` → plaintext `Uint8Array`. If `compressed && zstd`: `plain = zstd.ZstdStream.decompress(plain)` (stream, not simple).
6. Concatenate all chunks into one `Uint8Array full`.
7. **Integrity**: `sha256Hex(full)` must equal `meta.sha256` else throw `"File integrity check failed"`.
8. `blob = new Blob([full], { type: "application/octet-stream" })` → `openPreview(blob, filename, size)`. Note: blob is generic octet-stream; the viewer must dispatch type by filename.

`handlePreview(filename)` wraps it: `vault.withPassphrase(() => { void startPreview(filename); })` — gates on the single vault unlock first.

### `hooks/useFolderProtection.ts` — `passwordForFile(file)` password selection

```ts
passwordForFile: (file: FileMetadata) => Promise<string>;
```

Body logic:
- `fid = file.folder_id ?? null`; `info = fid ? registryGet(fid) : null`; `protectedFolder = !!fid && info != null && info.pwSalt != null`.
- **Unprotected** (`!protectedFolder`): returns `new Promise((resolve) => vault.withPassphrase((pp) => resolve(pp)))` — the vault passphrase. If the user cancels the vault modal the promise stays pending (action never runs).
- **Protected, cached**: `cached = cacheGet(fid!)`; if present → `Promise.resolve(cached)`.
- **Protected, not cached**: opens the folder-unlock modal via `openModal(fid, name, resolve, reject)`. On confirm it VERIFIES (`verifyFolderPassword`) then caches (TTL) and resolves; on cancel it REJECTS with `FolderUnlockCancelled`.

Related members on `UseFolderProtection` (exact):
- `thumbnailPasswordResolver: (fileId: string, fileById: Map<string, FileMetadata>) => string | null` — non-prompting; null for a locked protected folder.
- `isFileProtected: (file: FileMetadata) => boolean`
- `withFolderPassword: (folderId, folderName, action: () => void, onCancel?: () => void) => void`
- `clearFolderPassword: (folderId: string) => void`
- `protectFolder(folderId, newPassword, filesInFolder, vaultPassphrase, onProgress?) => Promise<void>`
- `unprotectFolder(folderId, folderPassword, filesInFolder, vaultPassphrase, onProgress?) => Promise<void>`
- `rekeyFileForMove(fileId, sourcePassword, destPassword) => Promise<void>`
- `modalState: FolderUnlockModalState`

Exported errors: `class FolderUnlockCancelled extends Error`, `class FolderPasswordRequired extends Error { readonly folderId: string }`.
Exported standalone (works outside React tree): `async function resolveFilePasswordGlobal(fileId: string): Promise<string>` — reads global singleton stores; throws `Error("Vault is locked")` or `FolderPasswordRequired`.

---

## 2. `lib/crypto.ts` signatures + zstd usage

```ts
export function generateSalt(): Uint8Array;                       // 32 bytes
export async function deriveKeyBytes(passphrase: string, salt: Uint8Array): Promise<ArrayBuffer>; // PBKDF2-SHA256 600k, 256-bit
export async function encryptChunk(keyBytes: ArrayBuffer, plaintext: Uint8Array): Promise<Uint8Array>; // [12B IV||ct||16B tag]
export async function decryptChunk(keyBytes: ArrayBuffer, data: Uint8Array): Promise<Uint8Array>;
export function generateCEK(): Uint8Array;                        // random 32-byte CEK
export async function wrapKey(kekBytes: ArrayBuffer, cek: Uint8Array): Promise<Uint8Array>;
export async function unwrapKey(kekBytes: ArrayBuffer, wrapped: Uint8Array): Promise<Uint8Array>;
export class IncorrectPassphraseError extends Error {}            // thrown when envelope CEK unwrap fails AES-GCM auth
export async function resolveFileKey(passphrase: string, salt: Uint8Array, wrappedCek?: string | null): Promise<ArrayBuffer>;
export async function sha256Hex(data: Uint8Array): Promise<string>;   // hex digest
export async function sha256File(file: File): Promise<string>;        // streaming for >50MB via @noble/hashes
export function toBase64(data: Uint8Array): string;
export function fromBase64(b64: string): Uint8Array;
export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
```

- `resolveFileKey`: derives KEK from passphrase+salt; if `wrappedCek` present, unwraps to the per-file CEK (throws `IncorrectPassphraseError` on auth failure); if absent (legacy) returns the KEK directly. Returns raw `ArrayBuffer`.
- Chunk wire format everywhere: `[12B IV][ciphertext][16B auth tag]`.

### `lib/api.ts` meta/chunk shapes

```ts
export interface FileMetaResponse {
  id: string;
  original_name: string;
  original_size: number;
  compressed_size: number;
  encrypted_size: number;
  chunk_count: number;
  sha256: string;
  salt: string;            // base64
  wrapped_cek?: string;    // base64 envelope CEK (empty for legacy)
  status: string;
  created_at: string;
}
export function getFileMeta(fileId: string): Promise<FileMetaResponse>;          // GET /api/files/:id/meta
export async function getFileChunk(fileId: string, index: number): Promise<{
  data: ArrayBuffer;
  sha256: string;          // from X-Chunk-SHA256 header
  compressed: boolean;     // from X-Chunk-Compressed === "true"
}>;                                                                              // GET /api/files/:id/chunks/:index
```

### zstd import (`@oneidentity/zstd-js/wasm`)

```ts
const { ZstdInit } = await import("@oneidentity/zstd-js/wasm");
const zstd = await ZstdInit();
plain = zstd.ZstdStream.decompress(plain);   // Uint8Array -> Uint8Array; ZstdStream, NOT ZstdSimple
```
`ZstdStream.decompress` does NOT require the frame content size to be embedded. Only invoked when the chunk's `compressed` flag is true.

---

## 3. `components/ui/media-player.tsx`

```ts
export interface MediaPlayerProps {
  src: string;                  // object URL (or any playable src) for the decrypted blob
  filename: string;             // used as the audio title
  mime?: string;                // picks audio vs video skin
  kind?: "audio" | "video";     // force a skin; else inferred from mime/filename
}
export function MediaPlayer(props: MediaPlayerProps): JSX.Element;
```

Supports BOTH audio and video. Internals:
- `resolveKind(props)`: `props.kind` wins; else `mime` prefix `video/`/`audio/`; else extension lookup against:
  - `AUDIO_EXT = ["mp3","wav","flac","aac","ogg","m4a","oga","opus"]`
  - `VIDEO_EXT = ["mp4","mov","webm","mkv","m4v","ogv"]`
  - default `"audio"`.
- `useMediaController()` (internal hook) wires ONE `HTMLMediaElement` ref and exposes: `playing, current, duration, buffered, volume, muted, speed, ready, scrubbing` + handlers `togglePlay, seekTo(time), skip(delta), changeVolume(v), toggleMute, cycleSpeed, setScrubbing, setCurrent`. Speeds: `[0.5, 1, 1.5, 2]`.
- `AudioPlayer` (artwork + Music glyph + seek/volume/speed) and `VideoPlayer` (in-`<video>`, fullscreen via `requestFullscreen`, auto-hiding controls). The media element is created INTERNALLY — consumers pass only `src` + `filename`.
- Keyboard (scoped to wrapper): space/`k` toggle, arrows ±5s, `m` mute.

**Reuse-for-playlist note**: the component instantiates its own single media element/controller per render and has NO "ended → next" / track-list / queue API. Extending for a playlist requires either an `onEnded`/`onTrackChange` prop + external track list, or lifting the controller — neither exists today.

---

## 4. Explorer internals

### `components/files/vault-explorer.tsx` — selection + open + drag wiring

Props (exact):
```ts
export interface VaultExplorerProps {
  files: FileMetadata[];
  loading: boolean;
  error: string | null;
  onPreview?: (filename: string) => void;
  onDownload: (filename: string) => void;
  onShare?: (id: string) => void;
  onOpenDetails?: (file: FileMetadata) => void;     // row/card click when NOT in select mode
  onDelete: (id: string) => void;
  onMoveFile?: (fileId: string, folderId: string | null) => void;  // drag-drop move
  onMoveRequest?: (fileId: string) => void;         // opens page's MoveToFolderDialog (kebab)
  onBulkDelete?: (ids: string[]) => void;
  onBulkDownload?: (ids: string[]) => void;
  onUploadClick?: () => void;
  onOpenFolderRequest?: (folder: DecryptedFolder) => void;  // gate protected-folder open
  onProtectFolder?: (folder: DecryptedFolder) => void;
  onRemoveFolderPassword?: (folder: DecryptedFolder) => void;
  onMoveFolderRequest?: (folder: DecryptedFolder) => void;
}
```

Selection state (owned internally, files only — folders are never selectable):
- `const [selectMode, setSelectMode] = useState(false);`
- `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`
- `toggleSelect(id: string)` — add/remove id from the Set (this is the `onSelect` passed to rows/cards).
- `allSelected = sortedFiles.length > 0 && sortedFiles.every((f) => selectedIds.has(f.id))`.
- `selectAll()` — if `allSelected` clears, else selects all `sortedFiles` ids.
- `exitSelectMode()` — `setSelectMode(false); setSelectedIds(new Set())`.
- A `useEffect` prunes stale ids not in `sortedFiles` whenever the visible list changes.
- Bulk bar buttons call `onBulkDownload(Array.from(selectedIds))` / `onBulkDelete(Array.from(selectedIds))`.

Listing scope/sort: `folderFiles` = files where `(f.folder_id ?? null) === currentFolderId`, then search + `typeFilter` (`getFileCategory`) + sort by `SortField`. `entries: ExplorerEntry[]` = sortedFolders (always by name, first) then sortedFiles. View modes `"list" | "grid"` render `ExplorerRow` / `ExplorerCard`.

Row/card click + open handler — in `components/files/explorer/explorer-row.tsx`:
- **FileRow** `handleClick = () => { if (selectMode) onSelect(file.id); else actions.onOpenDetails?.(file); }`. Same on Enter/Space. The kebab menu (not the row click) fires `onPreview(file.original_name)`, `onDownload(file.original_name)`, `onShare(file.id)`, `onMoveRequest(file.id)`, `onDelete(file.id)`. **So a single click opens the DETAILS drawer, not preview** — preview is only reachable via the kebab.
- **FolderRow** `onClick={() => onOpenFolder(folder)}` (and Enter/Space). `onOpenFolder` is `openFolderGated`: if `onOpenFolderRequest` provided it delegates to the page (which verifies a protected folder's password before `setCurrentFolder`), else `openFolder(folder)` directly.

ExplorerRow/Card props passed from the explorer: `entry, actions, selectMode, selected (entry.kind==="file" && selectedIds.has(file.id)), onSelect=toggleSelect, onOpenFolder=openFolderGated, onRenameFolder, onDeleteFolder, onProtectFolder, onRemoveFolderPassword, onMoveFolderRequest, drag=dragPropsFor(entry)`.

### `hooks/useDragMove.ts`

```ts
export type DragKind = "file" | "folder";
export interface DragItem {
  kind: DragKind;
  id: string;
  name: string;             // for drag preview + toasts
  parentId?: string | null; // folders: current parent (to no-op same-parent drops)
}
export const useDragMove = create<DragMoveStore>(...);  // { dragging: DragItem|null; overTarget: string|null|undefined; startDrag(item); endDrag(); setOverTarget(target); }
export function canDrop(item: DragItem | null, destFolderId: string | null): boolean;
export const DRAG_MIME = "application/x-zcrypt-move";
```
- `canDrop`: false if no item; for folders false if dropping into itself (`item.id === destFolderId`) or already-there (`(item.parentId ?? null) === destFolderId`); files always allowed (caller handles same-folder no-op).
- Store: `startDrag(item)` sets `dragging`; `endDrag()` resets `{dragging:null, overTarget:undefined}`; `setOverTarget(target)` for hover highlight. `overTarget === null` means the Root crumb; `undefined` means none.

Drop handling (in `vault-explorer.tsx`):
- `acceptsDrag(destId)`: folder drag → `canDrop`; file drag → always true.
- `dropHandlers(destId)` returns `{onDragOver, onDragLeave, onDrop}`. `onDragOver` sets `dropEffect="move"` + `setOverTarget(destId)`; `onDrop → handleDropOnto(destId, e)`.
- `handleDropOnto(destId, e)`: reads `fileId = e.dataTransfer.getData(DRAG_MIME)`; **folder drop** → `moveFolder(item.id, destId).then(refreshFolders)` (API call, not a prop); **file drop** → `onMoveFile?.(item?.id ?? fileId, destId)`.
- `dragPropsFor(entry)`: folder drag enabled `!locked && !selectMode`; file drag enabled `!selectMode`. `onDragStart` sets `dataTransfer.setData(DRAG_MIME, id)` + `effectAllowed="move"` + `startDrag(...)`.

### `app/(app)/dashboard/page.tsx` — preview/details/move wiring

- `const preview = useFilePreview();` and `<FilePreviewModal open={preview.open} onClose={preview.closePreview} blob={preview.blob} filename={preview.filename} fileSize={preview.fileSize} />`. `useVaultActions` is given `openPreview: preview.openPreview, closePreview: preview.closePreview`.
- Explorer wiring: `onPreview={actions.handlePreview}`, `onOpenDetails={handleOpenDetails}` (sets `detailsTarget` + opens `<DetailsDrawer file={detailsTarget} open={detailsOpen} .../>`).
- Move (file): `onMoveFile={actions.handleMoveFileTo}` (drag, optimistic) and `onMoveRequest={setMoveTarget}` → `<MoveToFolderDialog open={!!moveTarget} fileId={moveTarget} onMoveFile={actions.moveFileWithRekey} onMoved={() => refresh()} />`.
- Move (folder): `onMoveFolderRequest={setMoveFolderTarget}` → a second `<MoveToFolderDialog fileId={null} folderId={moveFolderTarget?.id} .../>`.
- Folder protection dialogs: `<FolderUnlockModal state={folderProtection.modalState} />`, `<SetFolderPasswordDialog state={{...onSubmit: submitProtect}}/>`, `<RemoveFolderPasswordDialog state={{...onConfirm: submitRemoveProtection}}/>`.

---

## 5. Trash

### `components/files/trash-content.tsx` structure

`export function TrashContent()`. Self-contained (loads its own data; not the file-list hook). State: `files: FileMetadata[]`, `loading`, `busyId: string|null`, `purgeTarget: FileMetadata|null`, `purging`.
- `refresh()` → `await listTrash()` → `setFiles`. Runs in a `useEffect` on mount.
- `handleRestore(file)`: optimistic drop the row, `await restoreFile(file.id)`, reconcile via `refresh()` on error.
- `handlePurge()`: `await purgeFile(purgeTarget.id)`, drop the row, behind a destructive `<ConfirmDialog>`.
- Renders `PageHeader` + skeletons + `EmptyState` ("Trash is empty") + a `panel` list. Each row uses `getFileTypeInfo(file.original_name)` for icon/color/bg, shows `formatBytes(file.original_size)` and `deleted {formatDate(file.deleted_at)}`, with Restore / Delete (purge) buttons.

### Trash API in `lib/api.ts`

```ts
export function listTrash(): Promise<FileMetadata[]>;                    // GET  /api/files/trash
export function restoreFile(id: string): Promise<{ success: boolean }>; // POST /api/files/:id/restore
export function purgeFile(id: string): Promise<{ success: boolean }>;   // DELETE /api/files/:id/purge (irreversible — removes chunks)
```
(Soft-delete itself is `deleteFile(id): Promise<{ success: boolean }>` → `DELETE /api/files/:id`, and `bulkDeleteFiles(ids): Promise<{ deleted: number; failed: number }>` → `POST /api/files/bulk-delete`.)

---

## 6. `lib/utils.ts` type dispatch + `FileMetadata`

```ts
export interface FileTypeInfo {
  icon: string;       // one of: File, FileText, Image, Video, Music, Archive, Code, Cog, Table
  color: string;      // tailwind text-* class
  bg: string;         // tailwind bg-* class
  label: string;      // the category string (see below)
  gradient: string;   // tailwind from-*/to-* class
}
export function getFileTypeInfo(filename: string): FileTypeInfo;   // keyed by lowercased extension; default { icon:"File", label:"File", ... }
export function getFileCategory(filename: string): string;          // === getFileTypeInfo(filename).label
export function isImageFile(filename: string): boolean;             // jpg jpeg png gif webp svg bmp ico
export function getFileIcon(filename: string): string;             // === getFileTypeInfo(filename).icon (back-compat)
export function formatBytes(bytes: number): string;
export function formatDate(dateStr: string): string;
export function formatEta(startedAt: number, percent: number): string | undefined;
export function easeProgress(raw: number): number;
export function cn(...inputs: ClassValue[]): string;
```

**Category (`label`) strings `getFileCategory` can return** — the set a viewer dispatches on:
`"Document"`, `"Spreadsheet"`, `"Image"`, `"Video"`, `"Audio"`, `"Archive"`, `"Code"`, `"Data"`, `"Executable"`, `"Font"`, `"File"` (default/unknown).

Extension → category map (for type-based viewer dispatch):
- **Document** (`FileText`, rose): pdf, doc, docx, txt, rtf, odt, ppt, pptx
- **Spreadsheet** (`Table`, emerald): xls, xlsx, csv
- **Image** (`Image`, violet): jpg, jpeg, png, gif, webp, svg, bmp, ico
- **Video** (`Video`, blue): mp4, mov, avi, mkv, webm
- **Audio** (`Music`, pink): mp3, wav, flac, aac, ogg, m4a
- **Archive** (`Archive`, amber): zip, rar, 7z, tar, gz, bz2
- **Code** (`Code`): js, ts, tsx, jsx, py, go, rs, java, cpp, c, html, css
- **Data** (`Code`, emerald): json, xml, yaml, yml
- **Executable** (`Cog`, orange): exe, dmg, msi, app
- **Font** (`File`, fuchsia): ttf, otf, woff, woff2
- Anything else → **File** (`File`, muted).

Caveat for a viewer: `MediaPlayer`'s `AUDIO_EXT`/`VIDEO_EXT` include extensions (`m4v`, `ogv`, `oga`, `opus`, `avi`) that `getFileTypeInfo` maps differently or to default — dispatch by both maps or unify them.

### `FileMetadata` (`types/index.ts`)

```ts
export interface FileMetadata {
  id: string;
  original_name: string;
  original_size: number;
  compressed_size: number;
  encrypted_size: number;
  chunk_count: number;
  sha256: string;
  created_at: string;
  folder_id?: string | null;     // null/undefined = Root
  encrypted_name?: string;
  deleted_at?: string | null;    // set for trashed files
}
```

`DecryptedFolder` (`hooks/useFolders.ts`) `extends Folder` and adds `name: string` (decrypted) and `protected: boolean` (`pw_salt != null`).
