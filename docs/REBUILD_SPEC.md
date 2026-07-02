# zcrypt Vault Rebuild — Build Spec (single source of truth)

This is the creative + technical direction for rebuilding the authenticated **Vault**
into a real, unified, Apple-seamless file/folder explorer. Every build agent MUST
read this file AND `REBUILD_CONTRACT.md` (exact code signatures) before writing code.

Scope of THIS rebuild (folder-password encryption is a SEPARATE next phase — do NOT build it now):
1. **Unified file/folder explorer** (the centerpiece).
2. **Vault lock/unlock UX cleanup** (one clear state, no per-file jargon).
3. **Transfer manager** docked bottom-right (upload + download, resume/stop/retry, real progress, polished animation).
Notes module is already removed. Marketing + auth pages are OUT OF SCOPE — never touch `app/(marketing)`, `app/(auth)`, or shared marketing components.

---

## 0. Non-negotiable guardrails

- **Zero-knowledge is sacred.** Never send a passphrase or plaintext content to the server. Never log them. All authed network calls go through the existing `@/lib/api` helpers (which attach the JWT). Folder names stay encrypted (`lib/name-crypto.ts`). Do not introduce any server round-trip that would leak file content or the passphrase.
- **Preserve every existing behavior** in the preservation checklist (§5). This is a redesign, not a feature cull.
- **Token vocabulary (ONE way):** new code uses the `--color-*` CSS-variable utilities only — `bg-[var(--color-surface)]`, `text-[var(--color-text)]`, `text-[var(--color-text-secondary)]`, `text-[var(--color-text-muted)]`, `border-[var(--color-border)]`, `text-[var(--color-accent)]`, `bg-[var(--color-accent)]/10`, etc. Reuse the `.panel` and `.card` component classes for floating surfaces. **Never hardcode hex colors.** Do not invent new globals.css tokens (globals.css is frozen — append-only, and we are not appending in this rebuild). shadcn primitives keep their own internal classes — that's fine, don't rewrite them.
- **`"use client"`** on every interactive component. Icons from `@/lib/icons` (Hugeicons barrel) — never import a raw icon lib. `cn` from `@/lib/utils`.
- **Motion:** use `motion/react`. Always honor `useReducedMotion()` — animations degrade to instant. Keep it tasteful (Apple-calm, not flashy).
- **Verify before claiming done:** `cd app/frontend && bun run typecheck` and `bun run lint` must pass. No new TS errors. No new lint errors beyond the known pre-existing `react-hooks/exhaustive-deps` "rule not found" baseline.

---

## 1. Design language (Apple-seamless, minecloud-inspired, zcrypt cyan)

- Calm, generous, content-first. Soft rounded corners (`rounded-xl` / `rounded-2xl`), hairline borders (`border-[var(--color-border)]`), gentle shadows via `.panel`. No heavy chrome, no loud gradients in the explorer.
- Cyan/teal accent (`--color-accent`) is used sparingly: active state, the lock indicator, primary actions, progress fill, selection. Everything else is neutral.
- Numbers (sizes, dates, counts, timers) use `tabular-nums`.
- Light AND dark both first-class (tokens already handle this via `.app-shell` / `.dark .app-shell`).
- Micro-interactions: row hover raises subtly (`hover:bg-[var(--color-surface-1)]`), view-mode and drawer transitions are smooth, list items animate in with a small stagger, progress bars fill smoothly. All reduced-motion safe.

---

## 2. Component: Unified Explorer  →  `components/files/vault-explorer.tsx` (+ subcomponents under `components/files/explorer/`)

Replaces the current two-section layout (separate `FolderBrowser` card-grid ON TOP OF a separate `FileTable`). **Folders and files live in ONE listing with ONE breadcrumb.**

### API (the integrate step consumes this — keep props clean and stable)
Expose a single `<VaultExplorer />`. It should own as much of the browsing/selection/sort/search/drag state as is reasonable, and accept callbacks for actions that need the page's crypto/upload context. Suggested props (refine as needed, but document the final shape at the top of the file):
- `files: FileMetadata[]` — full file list (already loaded by the page).
- `loading: boolean`, `error: string | null`.
- callbacks: `onPreview(filename)`, `onDownload(filename)`, `onShare(id)`, `onOpenDetails(file)`, `onDelete(id)`, `onMoveFile(fileId, folderId|null)`, `onBulkDelete(ids)`, `onBulkDownload(ids)`, `onUploadClick()`.
- It internally uses `useFolders()` + `useFolderStore` for the folder tree/current folder, and `useDragMove` for DnD (see contract).

### Layout
- Wrap in a `.panel`. A clean **toolbar row** at the top:
  - left: **breadcrumb** (`Home › Folder › Sub`), each crumb clickable + a drop target (drag a file/folder onto a crumb to move it there). Truncate long names.
  - right: inline **search** input (filters the current folder; seed from `useVaultSearch` like today), **view toggle** (List / Grid), **Select** toggle, **New folder** button, and the type-filter chips can sit on a second line.
- **One listing** below the toolbar (a scroll area, `max-h` with `overflow-y-auto` — drop the old `Pagination`; render all items in the current folder; show a subtle "N folders · M files" count). Folders render FIRST, then files. Sorting applies within each group (folders sort by name; files by the chosen sort field).
  - **List mode:** a single consistent row component (`explorer-row.tsx`) that renders either a folder row or a file row. Folder row: folder icon (cyan-tinted), name, "N items" (or "—"), modified, kebab (Open / Rename / Delete). File row: type icon, name + small lock glyph, type, size, saved%, modified, kebab (Preview / Download / Share / Move / Delete). Column headers are sortable (reuse the sort affordance from the old `file-table.tsx`). Selection mode shows checkboxes.
  - **Grid mode:** cards (`explorer-card.tsx`) — folder cards and file cards (file cards may show a thumbnail when available via `useThumbnail`/`batchLoadThumbnails`). Consistent sizing, same hover/selection treatment.
- **Drag & drop:** dragging a file or folder onto a folder row/card or a breadcrumb crumb moves it (reuse `useDragMove` + `canDrop` + the page's `onMoveFile`; folders move via `moveFolder` then `refresh`, exactly as `folder-browser.tsx` does today). Show the same drop-target highlight (cyan ring).
- **Empty / locked / no-results states** via the existing `EmptyState` component: empty folder, no search match, and a non-blocking "Unlock your vault to read encrypted folder names" hint when locked (browsing still works; never block the listing).

### What to delete/replace after integration
The old `folder-browser.tsx` and the page's inline `file-table` / `file-card` grid / pagination blocks are superseded by the explorer. Leave the old files on disk (the integrate step stops importing them); do not delete them in the build phase.

---

## 3. Component: Vault Lock  →  `components/ui/vault-lock.tsx` + `hooks/useVaultLock.ts`

Goal: kill the confusing per-file passphrase jargon. There is exactly **one vault passphrase**; unlocking once unlocks everything for the TTL. Make that the visible, single mental model.

- `useVaultLock()` wraps `usePassphraseStore`: exposes `{ unlocked: boolean, remainingMinutes: number, unlock(): void, lock(): void }`. `unlock()` opens ONE `PassphraseModal` titled "Unlock your vault" (subtitle: "Enter your passphrase to decrypt, preview, and download your files"). On success it calls `setPassphrase` (existing 15-min TTL). `lock()` clears it.
- `<VaultLock />` renders a single pill for the page header:
  - **Locked:** a subtle `🔒 Locked` pill with an "Unlock" affordance (cyan).
  - **Unlocked:** `🔓 Unlocked · 14:32` with a small "Lock" (X) button, tabular-nums countdown (tick every 30s).
- The page's decrypt actions (download / preview / bulk-download / thumbnails / upload) should, when locked, trigger this ONE unlock prompt and then proceed — NOT a bespoke per-action "Enter Passphrase" modal that implies per-file passphrases. Reuse the existing `getPassphrase()` cached value silently once unlocked.
- Browsing/listing NEVER requires unlock. "Optional" = you only ever unlock when you actually decrypt something.
- This is a UX consolidation ONLY — do not change any crypto (`resolveFileKey`, envelope wrapping, salts) and do not change the TTL behavior.

---

## 4. Component: Transfer Manager  →  `components/transfer/transfer-manager.tsx` (+ item subcomponent) and store additions

A single docked **bottom-right** manager that unifies uploads + downloads. Replaces the inline `<UploadQueue />` and `<DownloadQueue />` in the page. It will be mounted in `app/(app)/layout.tsx` by the integrate step so it persists across navigation (the stores are already singletons).

### Visuals
- `fixed bottom-4 right-4 z-40`, a `.panel` card (rounded-2xl, shadow-2xl, backdrop), width ~`360–400px`, max-height with internal scroll. Header: "Transfers" + active count + collapse/expand chevron + "Clear completed". Collapses to a compact pill showing aggregate progress.
- Renders **null when the queue is empty** (no transfers → nothing on screen).
- Each item: direction icon (up/down), filename (truncate), status text, a smooth **progress bar** (real % — uploads from `bytesProcessed/totalBytes` or `progress`; downloads from `progress`), and contextual controls (see below). Active items show a subtle pulse; done items get a check and can auto-dismiss.
- **Animation (motion/react):** the dock slides up + fades in on first transfer; items use `AnimatePresence` + `layout` for add/remove/reorder; progress fill animates; collapse/expand is smooth. All reduced-motion safe.

### Controls (must be REAL, not fake)
- **Upload — in progress:** Pause / Resume + Cancel.
  - The upload store already supports resume (see contract: `ResumeCtx`, `getUploadStatus` → `uploaded_chunks`, idempotent chunks, `retryUpload`). You MUST add to `store/upload.ts`: a per-item paused flag + `pauseUpload(id)` (stop sending further chunks — at minimum stop *before the next chunk*; abort the in-flight request if `upload-session` accepts an `AbortSignal`, otherwise pause at the chunk boundary — confirm via contract) that PRESERVES the resume context, and `resumeUpload(id, passphrase)` that continues from `getUploadStatus`'s `uploaded_chunks`. Do NOT cancel the server session on pause.
- **Upload — failed:** Retry (uses `retryUpload`, which resumes from uploaded chunks) + Dismiss.
- **Download — in progress:** Stop (cancel via the existing `AbortController` / `cancelDownload`).
- **Download — failed/cancelled:** Retry (`retryDownload` — restarts; downloads are not resumable, that's honest) + Dismiss.
- **Done:** check icon + Dismiss; "Clear completed" removes all done/cancelled.
- Retry/Resume need the passphrase — if not cached, trigger the vault unlock (via `useVaultLock` / the page's unlock path) then proceed.

### Store work (transfer agent owns `store/upload.ts` + `store/download.ts`)
- Add the pause/resume methods above to the upload store, preserving all existing behavior (SSE status routing, batch summary, debounced refresh, HF direct upload, desktop/Tauri path). Add a `"paused"` `UploadStatus` if needed (update `types/index.ts` `UploadStatus` union + anywhere it's switched on — check the contract for all switch sites).
- Expose a small selector/helper if useful, but keep the public surface minimal and typed.

---

## 5. Preservation checklist (the integrate step MUST keep all of these working)

From the current `app/(app)/dashboard/page.tsx`:
- Upload flow: dupe detection + toast, quota `can_upload` guard, passphrase gate (now via vault unlock), `startDesktopUpload` on Tauri, HF-direct for large files, SSE progress → upload store, batch-summary refresh, notifications.
- Download: single + **bulk ZIP** (2GB cap warning), passphrase gate, progress.
- Preview: in-memory decrypt + zstd stream decompress + SHA-256 integrity check + media via `FilePreviewModal`; wrong-passphrase → re-prompt with error.
- Thumbnails: `batchLoadThumbnails` when unlocked.
- Selection mode: select all/none, bulk download, bulk delete (optimistic + reconcile).
- Per-file: delete (optimistic, soft-delete → Trash), share (`ShareModal`), move (`MoveToFolderDialog` + drag), open details (`DetailsDrawer`).
- Folder scoping: list is scoped to `currentFolderId` (Root = `folder_id == null`); search/type-filter/sort operate within the folder.
- Tabs: **Files** and **Insights** (`InsightsTab`). Keep both.
- "Storage & backup" accordion (PlatformHealth + ExportImport) — keep, de-emphasized.
- "No storage available" warning, backend-error banner, feedback modal trigger.
- The ⌘K command palette seeding the search (`useVaultSearch`).
- All modals still wired: PassphraseModal (now the single vault-unlock), ShareModal, DetailsDrawer, MoveToFolderDialog, FilePreviewModal, ConfirmDialog(s), Upload dialog, FeedbackModal.

If something here doesn't fit the new explorer cleanly, keep it working and note it — do not silently drop it.

---

## 6. Integration (integrate step) — files it owns: `app/(app)/dashboard/page.tsx`, `app/(app)/layout.tsx`

- Rewrite the Vault page to compose `<VaultExplorer />` (replacing FolderBrowser + the search/view-toggle/type-filter/FileTable/FileCard-grid/Pagination blocks) while keeping all the crypto/upload/download/preview/share/details handlers (move handlers into the page or a hook; pass as props/callbacks to the explorer). Put `<VaultLock />` in the `PageHeader` actions. Keep the Files/Insights tabs and the Storage accordion.
- Mount `<TransferManager />` once in `app/(app)/layout.tsx` (inside `.app-shell`, after `<main>`), so transfers persist across pages and float bottom-right everywhere in the app. Remove the inline `<UploadQueue />` / `<DownloadQueue />` from the page body.
- The page should get materially smaller and read as composition, not a god-component. Extract handler clusters into a `hooks/useVaultActions.ts` if it helps clarity (optional but encouraged).

---

## 7. Review dimensions (review step)
- **Design/UX vs this spec** — is it genuinely Apple-seamless and unified, or still two-sections-in-a-trenchcoat? Spacing, hierarchy, motion taste, light+dark.
- **Behavior preservation** — every item in §5 still works; no dropped flow.
- **Zero-knowledge safety** — no passphrase/plaintext to server or logs; authed calls via `@/lib/api`; encrypted folder names intact.
- **Accessibility** — keyboard nav (rows, kebabs, breadcrumb, dock controls), focus-visible rings, aria labels, reduced-motion.
