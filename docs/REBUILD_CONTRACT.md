# zcrypt Vault Rebuild — Code Contract (exact signatures)

> **Status: shipped.** These contracts are implemented. Some references are outdated
> (the old `components/upload/` and `components/download/` were replaced by
> `components/transfer/`) and line numbers have drifted — treat the code as source of truth.

Transcribed verbatim from source. Build agents MUST honor these. Paths are relative to `app/frontend/`.
Do NOT guess — if something here disagrees with source, source wins and update this file.

---

## 1. `store/upload.ts` — `useUploadStore` (Zustand, `create<UploadStore>`)

### State + method signatures (interface `UploadStore`, lines 104–117)
```ts
queue: UploadItem[];
addToQueue: (file: File) => string;                       // returns new item id
addBatchToQueue: (files: File[]) => { file: File; id: string }[];
setFileId: (id: string, fileId: string) => void;          // sets backend file_id for SSE routing
updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string, bytesProcessed?: number, totalBytes?: number) => void;
setError: (id: string, error: string) => void;            // forces status "failed" + error
removeFromQueue: (id: string) => void;                    // "give up": cancels server session if resume.sessionId exists, deletes itemMeta
clearCompleted: () => void;                               // removes items where status === "done"
findByFileId: (fileId: string) => UploadItem | undefined;
startUpload: (files: File[], passphrase: string, platform?: string, maxConcurrent?: number, onRefresh?: () => void, hfConnected?: boolean) => void;
retryUpload: (id: string, passphrase: string) => void;    // resumes from uploaded chunks (keeps id → keeps itemMeta.resume)
startDesktopUpload: (passphrase: string, onRefresh?: () => void) => void;  // Tauri sidecar path
```

### `UploadItem` (from `@/types`, types/index.ts:82–93)
```ts
interface UploadItem {
  id: string; file: File; fileId?: string;
  status: UploadStatus; progress: number; stage: string; startedAt: number;
  bytesProcessed?: number; totalBytes?: number; error?: string;
}
```

### `UploadStatus` union (types/index.ts:80)
```ts
type UploadStatus = "queued" | "encrypting" | "uploading" | "done" | "failed";
```
**Adding `"paused"`: update this union in types/index.ts, then audit EVERY switch/compare site below.**

### EVERY place UploadStatus is read/compared (file:line)
- `types/index.ts:80` — union definition. `types/index.ts:86` — `UploadItem.status` field.
- `store/upload.ts:76` — `pendingUpdates` map value type `{ status: UploadStatus; ... }`.
- `store/upload.ts:109` — `updateStatus` param type.
- `store/upload.ts:461` — `updateStatus`: `if (status === "done" || status === "failed")` → terminal flush immediately; else batched via `scheduleFlush`. **A `"paused"` status is NOT terminal here — it must NOT hit this branch if you want it flushed; pass it through `set` directly or add it to the terminal check.**
- `store/upload.ts:482` (`setError`) — sets `status: "failed"`.
- `store/upload.ts:501` (`clearCompleted`) — `item.status !== "done"`.
- `store/upload.ts:541–544` — batch summary counts: `i.status === "done"`, `i.status === "failed"`; percent sum treats done/failed as 100 else `progress`.
- `store/upload.ts:565–566` — final summary toast counts (`done`/`failed`).
- `store/upload.ts:592` (`retryUpload`) — resets item to `status: "queued"`, `error: undefined`, `progress: 0`, `stage: "Retrying..."`.
- `store/upload.ts:423` (`addToQueue`) / `:441` (`addBatchToQueue`) — seed `status: "queued"`.
- `store/upload.ts:221/235/249/267/372/395/398/619/621` — internal `updateStatus(...)` calls inside `uploadOneFile`/`startDesktopUpload` emit `"encrypting"`/`"uploading"`/`"queued"`/`"done"`.
- `app/(app)/dashboard/page.tsx:174–181` — SSE→store: derives status from `stageLower` (`"done"` | includes `"encrypt"` → `"encrypting"` | else `"uploading"`), then `updateStatus(...)`.
- `components/upload/upload-queue.tsx` — `:78`(`"done"`), `:79`(`"failed"`), `:80`(`"queued"`), `:87–88`(`"done"`/`"failed"`), `:93`(`"failed"`), `:178`(`isActive = status !== "done" && !== "failed" && !== "queued"`), `:186`(`"done"`), `:187`(`"failed"`), `:193–195`(`"done"`/`"failed"`/`"queued"`), `:228`(`"failed"`). NOTE: this component is being SUPERSEDED by the transfer manager; keep it on disk but stop importing it (integrate step).

### Resume mechanics (how resume works TODAY — DO NOT break)
- `ResumeCtx` (store/upload.ts:124–131, module-private):
  ```ts
  interface ResumeCtx { sessionId: string; fileId: string; cekBytes: ArrayBuffer; chunkCount: number; directUpload: boolean; shouldCompress: boolean; }
  ```
  Holds the raw CEK so a resume re-encrypts remaining chunks with the SAME key (a fresh key would corrupt the file). In-memory, page-session only.
- `itemMeta` (store/upload.ts:136, module-private `Map<string, {...}>`):
  ```ts
  Map<string, { platform?: string; onRefresh?: () => void; resume?: ResumeCtx; routedToHF?: boolean }>
  ```
- `uploadOneFile(file, id, opts)` (store/upload.ts:197) reads `itemMeta.get(id)?.resume`. If present → reuse session+CEK, call `getUploadStatus(sessionId)` → `new Set(status.uploaded_chunks)`, skip `done.has(i)` chunks (idempotent by SHA, line 327). If absent → fresh init, then `itemMeta.set(id, { ...meta, resume })` AT LINE 280–281 so a mid-upload failure can resume.
- On error (catch, store/upload.ts:401–409): calls `setError`, **deliberately does NOT cancel the session** — keeps it so Retry resumes.
- `removeFromQueue` (store/upload.ts:485–497): the "give up" path — if `meta?.resume?.sessionId` exists, fires `cancelUpload(sessionId)`, deletes `itemMeta`, removes from queue.
- `retryUpload(id, passphrase)` (store/upload.ts:584): resets the queue item in place (keeps id) and re-runs `uploadOneFile(item.file, id, { passphrase, platform: meta?.platform, profile, onRefresh: meta?.onRefresh })` → continues from uploaded chunks.

### PAUSE/RESUME additions you must make (spec §4)
- Add `"paused"` to `UploadStatus` (types/index.ts:80) and handle it at the 461 terminal-check and 541/565 count sites (treat `"paused"` like in-progress for counts; do NOT count it as done/failed).
- `pauseUpload(id)` must stop sending FURTHER chunks while PRESERVING `itemMeta[id].resume` (do NOT call `cancelUpload`). See §3 for abort capability: **chunk-level fetches do NOT accept an AbortSignal**, so true mid-chunk abort is impossible — pause at the chunk boundary (set a per-item paused flag the chunk loop checks before `acquirePipelineSlot`/launching the next chunk). Optionally also `controller.abort()` if you wire an AbortController into the fetch wrappers — but the current wrappers ignore it (see §3).
- `resumeUpload(id, passphrase)` continues from `getUploadStatus(sessionId).uploaded_chunks` — effectively the same path as `retryUpload`, but from a `"paused"` (not `"failed"`) state.

### Module-internal behaviors to preserve (do not regress)
Debounced refresh (1500ms, :13), background push notifications (:27 `startBackgroundNotifications`/:67 stop), throttled `scheduleFlush` via `requestAnimationFrame` (:79), large-file→HF nudge `resolveUploadPlatform` (:146, threshold 2GB), `COMPRESSED_EXTENSIONS` skip (:158), `withRetry` rate-limit wrapper (:167), two-stage backpressure pipeline (:286+), batch summary toast (:560).

---

## 2. `store/download.ts` — `useDownloadStore` (Zustand)

### `DownloadStatus` union (download.ts:7)
```ts
type DownloadStatus = "queued" | "downloading" | "done" | "failed" | "cancelled";
```

### `DownloadItem` (download.ts:9–19)
```ts
interface DownloadItem {
  id: string; fileId: string; filename: string; fileSize: number;
  status: DownloadStatus; progress: number; stage: string; error?: string; startedAt: number;
}
```

### Store interface (download.ts:48–58)
```ts
queue: DownloadItem[];
controllers: Map<string, AbortController>;                 // id → controller for cancellation
startDownload: (fileId: string, filename: string, fileSize: number, passphrase: string) => void;
startBulkZipDownload: (files: BulkDownloadFile[], passphrase: string) => void;   // ZIP path (2GB cap warning lives in page)
cancelDownload: (id: string) => void;                      // controller.abort() — does NOT remove from queue
retryDownload: (id: string, passphrase: string) => void;   // removeFromQueue(id) then startDownload(...) fresh (NOT resumable)
removeFromQueue: (id: string) => void;                     // aborts if running, deletes controller + queue item
clearCompleted: () => void;                                // removes status === "done" || "cancelled"
```

### AbortController usage
- `startDownload`/`startBulkZipDownload` create a `new AbortController()`, store it in `controllers` map, pass `signal: controller.signal` to `downloadAndDecryptFile`/`downloadAsZip`, and clean it up in `finally`.
- Abort → caught as `DOMException` with `err.name === "AbortError"` (download.ts:126, :202) → status set to `"cancelled"`. Downloads ARE truly mid-stream cancellable (unlike uploads).

### DownloadStatus compare sites
- `download.ts:90, :173` — `if (status === "done" || "failed" || "cancelled")` terminal flush.
- `download.ts:260` — `clearCompleted`: `!== "done" && !== "cancelled"`.
- `components/download/download-queue.tsx:23,25,54–116` — full switch (being SUPERSEDED by transfer manager; keep on disk, stop importing).

---

## 3. `lib/upload-session.ts` — chunk API wrappers (AbortSignal status per fn)

All go through `authedFetch` (refreshes token on 401). API_BASE = `process.env.NEXT_PUBLIC_API_URL`.

```ts
initUpload(params: UploadInitParams): Promise<UploadInitResponse>     // POST /api/upload/init   — NO AbortSignal param
uploadChunk(sessionId: string, index: number, encryptedData: Uint8Array, sha256: string, compressed: boolean): Promise<void>
                                                                       // PUT /api/upload/{sid}/chunk/{idx}  — NO AbortSignal
presignChunk(sessionId: string, index: number, sha256: string, size: number): Promise<PresignResponse>
                                                                       // POST /api/upload/{sid}/presign/{idx} — NO AbortSignal
directUploadToURL(url: string, headers: Record<string,string> | null, data: Uint8Array): Promise<void>
                                                                       // raw fetch PUT to platform, 3 retries — NO AbortSignal
confirmChunk(sessionId: string, index: number, sha256: string, size: number, remotePath: string, compressed: boolean): Promise<void>
                                                                       // POST /api/upload/{sid}/confirm/{idx} — NO AbortSignal
completeUpload(sessionId: string, encryptedSize: number, compressedSize: number): Promise<UploadCompleteResponse>
                                                                       // POST /api/upload/{sid}/complete — NO AbortSignal
cancelUpload(sessionId: string): Promise<void>                        // DELETE /api/upload/{sid} — NO AbortSignal
getUploadStatus(sessionId: string): Promise<UploadStatusResponse>     // GET /api/upload/{sid}/status — NO AbortSignal
```

### **CRITICAL — abort capability**
**NONE of these accept an `AbortSignal`.** No `RequestInit.signal` is plumbed through `authedFetch` or the raw `fetch` in `directUploadToURL`. Therefore **true mid-chunk upload abort is NOT possible** with the current code. **Pause MUST happen at the chunk boundary** (check a per-item paused flag in the `uploadOneFile` chunk loop before launching the next chunk; in-flight chunks finish). Do not claim mid-chunk cancellation. (If a future change wants real abort, it must add an optional `signal` param to these wrappers + `authedFetch` — out of scope for this rebuild.)

### Response/param types
```ts
UploadInitParams  { filename; original_size; sha256; salt /*b64*/; wrapped_cek /*b64*/; chunk_count; platform? }
UploadInitResponse{ session_id; file_id; platform; direct_upload }
PresignResponse   { upload_url; upload_headers: Record<string,string>|null; remote_path; already_exists }
UploadCompleteResponse { file_id }
UploadStatusResponse { session_id; file_id; status; chunk_count; uploaded_chunks: number[]; completed_count }
```

---

## 4. Hooks + folder/drag stores

### `hooks/useFileList.ts` → `useFileList()`
Returns: `{ files: FileMetadata[]; loading: boolean; error: string | null; refresh: (filter?: string) => Promise<void>; setFiles: (files) => void }`.
Backed by `useFileStore` singleton (survives navigation). `refresh(filter?)` calls `listFiles(filter)`; offline-cache hydrate on mount.

### `hooks/useFolders.ts` → `useFolders()`
```ts
interface DecryptedFolder extends Folder { name: string; }   // name = decrypted, "[locked]" when no key
```
Returns:
```ts
{
  folders: DecryptedFolder[];
  loading: boolean;
  locked: boolean;                                   // true when no name key (vault locked)
  refresh: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;     // throws "Unlock your vault to create folders" if locked
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  openFolder: (folder: DecryptedFolder) => void;     // → setCurrentFolder(folder.id, folder.name)
  navigateToCrumb: (index: number) => void;
  currentFolderId: string | null;                    // from useFolderStore
  breadcrumb: Crumb[];                               // from useFolderStore
}
```
Names decrypted via `deriveNameKey(passphrase, user.id)` + `decryptNameSafe` (name key cached in refs). `refresh` re-derives `locked` each call. Auto-`refresh()` on `currentFolderId` change (useEffect).

### `store/folders.ts` → `useFolderStore` (Zustand)
```ts
interface Crumb { id: string | null; name: string; }
const ROOT_CRUMB = { id: null, name: "My Vault" };          // folders.ts:9
interface FolderStore {
  currentFolderId: string | null;                            // null = Root
  breadcrumb: Crumb[];                                       // starts [ROOT_CRUMB]
  folders: Folder[];                                         // raw (encrypted) folders
  decryptedNames: Record<string, string>;
  loading: boolean;
  setFolders: (folders: Folder[]) => void;
  setDecryptedNames: (names: Record<string,string>) => void;
  setLoading: (loading: boolean) => void;
  setCurrentFolder: (id: string | null, name: string) => void;   // null resets breadcrumb to [ROOT]; truncates if crumb already on trail
  pushCrumb: (crumb: Crumb) => void;
  navigateToCrumb: (index: number) => void;                  // truncates breadcrumb to index+1
  reset: () => void;
}
```

### `hooks/useDragMove.ts` → `useDragMove` (Zustand)  [no `moveFolder` here — see note]
```ts
type DragKind = "file" | "folder";
interface DragItem { kind: DragKind; id: string; name: string; parentId?: string | null; }
interface DragMoveStore {
  dragging: DragItem | null;
  overTarget: string | null | undefined;                     // hovered drop target id; null = Root crumb; undefined = none
  startDrag: (item: DragItem) => void;
  endDrag: () => void;                                       // clears dragging + overTarget(undefined)
  setOverTarget: (target: string | null | undefined) => void;
}
function canDrop(item: DragItem | null, destFolderId: string | null): boolean;   // false for folder→itself or folder already in dest; files always true
const DRAG_MIME = "application/x-zcrypt-move";               // dataTransfer key (carries the dragged id)
```
**Move execution is NOT in this store.** Folders move via `moveFolder(id, parentId)` from `@/lib/api` then `refresh()` (pattern in `components/files/folder-browser.tsx:79–100` `handleDropOnto`). Files move via the page-supplied `onMoveFile(fileId, folderId|null)` callback (which calls `moveFile` + optimistic reconcile). Reuse the `dropHandlers(destId)` / `acceptsDrag(destId)` pattern from folder-browser.tsx:104–124 for crumb + folder drop targets (cyan ring highlight: `bg-[var(--color-accent)]/10 ... ring-2 ring-inset ring-[var(--color-accent)]`).

### `hooks/useQuota.ts` → `useQuota()`
Returns `{ quota: QuotaInfo | null; refresh: () => Promise<void> }`. Backed by `useQuotaStore`. Auto-fetches once when `quota` is null.

### `hooks/useThumbnail.ts`
```ts
useThumbnail(fileId: string, filename: string): { thumbnailUrl: string | null; loading: boolean }
useThumbnailCache(): Map<string, string>
batchLoadThumbnails(files: FileMetadata[], passphrase: string): Promise<void>   // call once when unlocked; filters image files < 50MB, MAX_CONCURRENT=3
hasCachedThumbnail(fileId: string): boolean
getCachedThumbnailCount(): number
```
Backed by in-memory `memCache` mirrored from IndexedDB (`zcrypt_thumbs`). `useThumbnail` subscribes via `useSyncExternalStore`. Decrypts client-side (`resolveFileKey` + `decryptChunk` + zstd) — passphrase required, never sent to server.

### `components/ui/command-palette.tsx` (two Zustand stores exported here)
```ts
useCommandPalette: { open: boolean; setOpen: (open: boolean) => void; toggle: () => void }   // ⌘K toggles
useVaultSearch:    { query: string; setQuery: (query: string) => void }                       // palette seeds the Vault search; read query to filter
export function CommandPalette();   // the dialog component itself
```
There is NO separate `useVaultSearch.ts` file — it lives in command-palette.tsx (line 34). Selecting a file in the palette calls `useVaultSearch.getState().setQuery(name)` then routes to `/dashboard`.

---

## 5. Reusable component prop interfaces (exact)

### `components/ui/empty-state.tsx`
```ts
EmptyState({ icon: ReactNode; title: string; description: string; action?: ReactNode })
```

### `components/ui/passphrase-modal.tsx`
```ts
PassphraseModal({
  open: boolean;
  onConfirm: (passphrase: string) => void;     // if "remember" checked, also caches via usePassphraseStore.setPassphrase
  onClose: () => void;
  title?: string;          // default "Enter Passphrase"   → spec §3 wants "Unlock your vault"
  subtitle?: string;
  confirmLabel?: string;   // default "Confirm"            → spec wants "Unlock"
  error?: string | null;   // shows red error banner (use for wrong-passphrase re-prompt)
})
```
Renders via `createPortal` to `document.body`. Has its own "Remember for this session" checkbox (default checked) that calls `cachePassphrase` directly.

### `components/files/details-drawer.tsx`
```ts
DetailsDrawer({ file: FileMetadata | null; open: boolean; onOpenChange: (open: boolean) => void })
```
Wraps `Sheet side="right"`. Lazily loads server meta + shares; owns its own Details/Sharing tabs and share-create/revoke flow (needs cached passphrase to create a share).

### `components/ui/share-modal.tsx`
```ts
ShareModal({ open: boolean; onClose: () => void; fileId: string; fileName: string; fileSize: number })
```
`createPortal` modal. Share key lives only in URL `#key=` fragment, never sent to server.

### `components/files/move-to-folder-dialog.tsx`
```ts
MoveToFolderDialog({ open: boolean; fileId: string | null; onClose: () => void; onMoved?: () => void })
```
Wraps `Dialog`. Lazy nested tree via `listFolders(parentId)`; calls `moveFile(fileId, selected)` (`selected` null = Root). `locked` shows "Unlock your vault to see folder names".

### `components/ui/file-preview-modal.tsx` + `useFilePreview`
```ts
FilePreviewModal({ open: boolean; onClose: () => void; blob: Blob | null; filename: string; fileSize: number })
useFilePreview(): { open; blob; filename; fileSize; openPreview(blob: Blob|null, filename: string, fileSize: number): void; closePreview(): void }
```
`createPortal`. Handles image/text/pdf/video/audio via type sniff + `MediaPlayer`. Blob is already-decrypted plaintext (page does decrypt + integrity check before calling `openPreview`).

### `components/ui/confirm-dialog.tsx`
```ts
ConfirmDialog({
  open: boolean; onOpenChange: (open: boolean) => void;
  title: string; description: ReactNode;
  confirmLabel?: string;  // default "Confirm"
  cancelLabel?: string;   // default "Cancel"
  destructive?: boolean;  // red confirm
  onConfirm: () => void;  // dialog stays mounted during async (preventDefault on click)
  loading?: boolean;      // disables actions + spinner
})
```
Wraps `AlertDialog` primitive.

### `components/ui/icon-button.tsx`
```ts
IconButton (forwardRef<HTMLButtonElement>) extends Omit<ButtonHTMLAttributes,"aria-label"> {
  icon: ComponentType<{ className?: string; size?: number }>;   // from @/lib/icons
  label: string;                              // tooltip text AND aria-label (required)
  variant?: "primary" | "secondary" | "danger" | "ghost";   // default "ghost"
  side?: "top" | "right" | "bottom" | "left";               // default "top"
  iconClassName?: string;                     // default icon is h-4 w-4
}
```
Always wraps a shadcn Tooltip. Underlying Button is `size="icon"`.

### `components/ui/page-header.tsx`
```ts
PageHeader({ title: string; description?: string; eyebrow?: string; actions?: ReactNode; className?: string })
```
`actions` = right-aligned slot → put `<VaultLock />` here.

### `components/ui/button.tsx`
```ts
Button (forwardRef) extends ButtonHTMLAttributes { variant?: "primary"|"secondary"|"danger"|"ghost"; size?: "sm"|"md"|"lg"|"icon" }  // defaults primary / md
buttonVariants = cva(...)   // shadcn variants: variant ∈ default|destructive|outline|secondary|ghost|link, size ∈ default|sm|lg|icon. For shadcn primitives only — bespoke Button keeps its own API.
```

### `components/ui/input.tsx`
```ts
Input (forwardRef) extends InputHTMLAttributes { label?: string; icon?: ReactNode }   // icon → left-inset, adds pl-10
```

### shadcn primitives (exported names — use as composed, props are Radix-standard)
- `dropdown-menu.tsx`: `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup`
- `tabs.tsx`: `Tabs, TabsList, TabsTrigger, TabsContent`
- `accordion.tsx`: `Accordion, AccordionItem, AccordionTrigger, AccordionContent`
- `dialog.tsx`: `Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription`
- `sheet.tsx`: `Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription` — `SheetContent` takes `side?: "top"|"right"|"bottom"|"left"` (default `"right"`).

---

## 6. Util signatures + return shapes (`lib/utils.ts`)

```ts
cn(...inputs: ClassValue[]): string                          // clsx + tailwind-merge
formatBytes(bytes: number): string                           // "0 B" if <=0; B/KB/MB/GB/TB, 1 decimal
formatDate(dateStr: string): string                          // "Just now" | "Nm ago" | "Nh ago" | "Nd ago" | localized date
getFileTypeInfo(filename: string): FileTypeInfo
getFileCategory(filename: string): string                    // = getFileTypeInfo(filename).label
isImageFile(filename: string): boolean
getFileIcon(filename: string): string                        // = getFileTypeInfo(filename).icon  (back-compat)
formatEta(startedAt: number, percent: number): string | undefined   // "~Ns/m/h left"; undefined when <3s elapsed or out of (1,100)
easeProgress(raw: number): number                            // log ease-out for display-only progress
```
```ts
interface FileTypeInfo {
  icon: string;     // Hugeicons key for @/lib/icons (e.g. "FileText","Image","Video","Music","Archive","Code","Cog","Table","File")
  color: string;    // tailwind text color class, e.g. "text-rose-500"; fallback "text-[var(--color-text-muted)]"
  bg: string;       // tailwind bg class, e.g. "bg-rose-500/10"; fallback "bg-[var(--color-surface-1)]"
  label: string;    // "Document"|"Spreadsheet"|"Image"|"Video"|"Audio"|"Archive"|"Code"|"Data"|"Executable"|"Font"|"File"
  gradient: string; // e.g. "from-rose-500/20 to-rose-500/5"
}
```
NOTE: `icon` is a string key — resolve to a component via a local map (see details-drawer.tsx:32 `iconMap`). These per-type tailwind color classes (rose/violet/blue/etc.) are the ONE allowed exception to the token-only rule (they are existing util output, not new code).

---

## 7. Types (`types/index.ts`)

```ts
interface FileMetadata {
  id: string; original_name: string; original_size: number; compressed_size: number;
  encrypted_size: number; chunk_count: number; sha256: string; created_at: string;
  folder_id?: string | null;   // null/undefined = Root
  encrypted_name?: string;      // AES-GCM base64; decrypt client-side
  deleted_at?: string | null;   // soft-delete → Trash
}
interface Folder {
  id: string; user_id: string; parent_id?: string | null;
  encrypted_name: string; created_at: string; deleted_at?: string | null;
}
interface UploadItem  { /* see §1 */ }
interface DownloadItem{ /* see §2, exported from store/download.ts (NOT types/index.ts) */ }
interface QuotaInfo {
  used_bytes; quota_bytes; has_personal_key; is_unlimited; plan;
  max_concurrent_uploads; max_file_size; can_upload; allows_byob;   // can_upload guards the upload flow
}
```

---

## 8. Supporting signatures the build needs

### `store/passphrase.ts` → `usePassphraseStore` (the ONE vault passphrase; spec §3)
```ts
{
  cachedPassphrase: string | null; cacheUntil: number | null; rememberByDefault: boolean;
  setPassphrase: (passphrase: string, ttlMinutes?: number) => void;   // default TTL 15 min, auto-clears
  getPassphrase: () => string | null;                                 // null if expired (clears on read)
  clear: () => void;
  getRemainingMinutes: () => number;                                  // ceil(remaining/60000), 0 if none
}
```
`useVaultLock()` (to be built) wraps this → `{ unlocked, remainingMinutes, unlock(), lock() }`. `unlocked = getPassphrase() !== null`. Do NOT change TTL behavior.

### `lib/api.ts` (exact export names — all via authedFetch)
```ts
listFiles(filter?: string): Promise<FileMetadata[]>
deleteFile(id: string): Promise<{ success: boolean }>
listFolders(parentId?: string | null): Promise<Folder[]>
createFolder(data: FolderRequest): Promise<Folder>             // FolderRequest { encrypted_name; parent_id? }
renameFolder(id: string, encryptedName: string): Promise<{ success: boolean }>
moveFolder(id: string, parentId: string | null): Promise<{ success: boolean }>
deleteFolder(id: string): Promise<{ success: boolean }>
moveFile(id: string, folderId: string | null): Promise<{ success: boolean }>
getQuota(): Promise<QuotaInfo>
```

### Download progress callback shapes (consumed by store/download.ts)
```ts
// lib/download-session.ts
type DownloadProgressCallback = (info: { stage: string; percent: number; chunksDone: number; chunksTotal: number }) => void;
interface DownloadOptions { onProgress?: DownloadProgressCallback; signal?: AbortSignal; }
downloadAndDecryptFile(fileId, passphrase, options?): Promise<...>      // signal HONORED (mid-stream abort works)
// lib/bulk-download.ts
interface BulkDownloadFile { fileId: string; filename: string; fileSize: number; }
interface BulkDownloadProgress { stage: string; percent: number; currentFile: string; filesDone: number; filesTotal: number; }
interface BulkDownloadOptions { onProgress?: (info: BulkDownloadProgress) => void; signal?: AbortSignal; }
downloadAsZip(files: BulkDownloadFile[], passphrase, options?): Promise<...>   // signal HONORED
```
Aborts surface as `DOMException` `name === "AbortError"`.

### Name crypto (zero-knowledge — never bypass)
`lib/name-crypto.ts`: `deriveNameKey(passphrase, userId): Promise<CryptoKey>`, `encryptName(name, key): Promise<string>`, `decryptNameSafe(encrypted, key): Promise<string>` (returns "[locked]"/safe value on failure, never throws).
