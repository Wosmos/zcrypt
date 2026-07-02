# Vault — Viewers + Drag Feel + Trash Actions (build spec)

Build a real multi-format file-viewer system, tactile drag/selection interactions, and
Deleted-Files actions. All client-side; zero-knowledge stays intact. Every build agent
reads this + FEATURES_CONTRACT.md (scout's exact signatures) before writing code.

## 0. Guardrails (NON-NEGOTIABLE)
- **Zero-knowledge:** files are decrypted ONLY in the browser using the existing crypto + the vault/folder password; never send plaintext or the passphrase to the server; never log them. Reuse the existing decrypt pipeline (chunks → AES-GCM decrypt → zstd decompress → SHA-256 integrity check) — see the contract for the exact current implementation in `hooks/useVaultActions.ts` (startPreview).
- **Render untrusted content safely:** file contents are untrusted. HTML/Markdown/DOCX output MUST be sanitized with **DOMPurify** before any `dangerouslySetInnerHTML`. The HTML viewer renders inside a **sandboxed `<iframe>`** (no `allow-scripts`). PDF renders from a decrypted **blob URL** in an `<iframe>`/`<object>` (no external network). Never inject raw file text as HTML.
- **Memory:** revoke every `URL.createObjectURL` blob URL on close/navigate; release large decrypted buffers.
- **Tokens:** `--color-*` utilities + `.panel`/`.card` only; NO hardcoded hex. `"use client"` on interactive components. Icons from `@/lib/icons`. `cn` from `@/lib/utils`. Motion via `motion/react`, honor `useReducedMotion()`.
- **Lazy-load heavy libs** (`mammoth`, `marked`, `dompurify`, `highlight.js`) via dynamic `import()` inside the viewer that needs them, so the main bundle isn't bloated.
- Never touch `app/(marketing)` / `app/(auth)`. `globals.css` + `tailwind.config.js` are FROZEN.
- Keep `bun run typecheck` + `bun run build` clean; add no new lint errors beyond the known `media-player.tsx` baseline.
- Deps are ALREADY installed (mammoth, marked, dompurify, highlight.js) — do NOT modify package.json.

---

## OWNER 1 — Viewer system + decryptor  (NEW files only; do not touch explorer/page/trash)

### `hooks/useFileDecryptor.ts`
A reusable hook `useFileDecryptor()` → `{ decryptToBlob(file: FileMetadata): Promise<Blob> }`.
- Reuses the EXACT decrypt logic from `useVaultActions.startPreview` (getFileMeta → resolve key via `resolveFileKey` → per-chunk `decryptChunk` → `ZstdStream.decompress` when compressed → concat → SHA-256 verify against meta). Extract/replicate it faithfully.
- **Folder-password aware:** pick the password via the existing `useFolderProtection` `passwordForFile(file)` (folder password for a protected-folder file, else the vault passphrase). If locked, it prompts through the existing unlock flow. Throw a typed error on wrong password so callers can re-prompt.
- Returns a `Blob` with the correct MIME (derive from extension via `lib/utils` `getFileTypeInfo`/a mime map).

### `components/viewers/file-viewer.tsx` — the overlay + dispatcher
`<FileViewer open files index onIndexChange onClose decrypt />` where `decrypt = (file) => Promise<Blob>`.
- Full-bleed overlay (`.panel`/backdrop). Header: filename, type, **Fullscreen toggle** (Fullscreen API on the overlay element; reflect state; Esc exits FS then closes), Download, Close.
- **Prev/Next** across `files` (wrap or clamp), with a counter "3 / 18".
- **Keyboard:** Esc=close, ←/→=prev/next, `f`=fullscreen. Focus-trap the overlay; restore focus on close. `role="dialog"` + `aria-modal`.
- Decrypt the current file (loading spinner; error state with Retry + Download). Revoke blob URLs on change/close.
- Dispatch by type (use `getFileCategory`/extension):
  - **image** → `image-viewer.tsx`: zoom (wheel + buttons), pan (drag), rotate, reset, fit. Reduced-motion safe.
  - **audio / video** → reuse/enhance `components/ui/media-player.tsx`: transport, scrubber, volume, and a **playlist** of the other media files in `files` (click to switch).
  - **pdf** → `pdf-viewer.tsx`: `<iframe>` of the decrypted blob URL (sandbox, no scripts). Toolbar: download, open-in-new (blob).
  - **docx** → `doc-viewer.tsx`: `mammoth.convertToHtml` on the blob's ArrayBuffer → **DOMPurify.sanitize** → render in a styled, scrollable reading pane.
  - **html / htm** → `html-viewer.tsx`: sandboxed `<iframe srcdoc={sanitizedOrRaw}>` with `sandbox` (NO `allow-scripts`); show a "scripts disabled for safety" note.
  - **markdown (md)** → `marked.parse` → DOMPurify → styled prose.
  - **csv / tsv** → parse → scrollable `<table>` (handle quotes/commas; cap very large files with a notice).
  - **text / code** (txt, json, js, ts, py, go, etc.) → monospace pane; lazy `highlight.js` highlight by extension; line wrap toggle. Cap huge files.
  - **fallback** (unknown / binary) → file metadata card + big Download button + "No preview for this type."
- Each sub-viewer is its own file under `components/viewers/`. Document `<FileViewer>`'s final prop interface at the top of file-viewer.tsx.

---

## OWNER 2 — Explorer interactions + viewer wiring  (owns `components/files/vault-explorer.tsx`, `components/files/explorer/*`, `hooks/useDragMove.ts`, `app/(app)/dashboard/page.tsx`, and a NEW `components/files/create-folder-from-files-dialog.tsx`)

Depends on OWNER 1 (read `file-viewer.tsx` + `useFileDecryptor.ts` for their interfaces).

**Open → viewer:** clicking a file row/card (outside selection mode) opens `<FileViewer>` (mounted by the page) with the current folder's files as the `files` list (so prev/next walks the folder) and `decrypt = useFileDecryptor().decryptToBlob`. Replace the old single-file preview path with this. Keep DetailsDrawer reachable via the kebab.

**Tilt-on-drag:** dragging a file lifts + tilts it like a real sheet — a custom drag ghost that is rotated (~4–6°), scaled up slightly, with a soft shadow, following the cursor. Use a styled element (either `setDragImage` with a cloned styled node, or a fixed-position ghost that tracks pointer). Reduced-motion → no tilt, just a plain ghost.

**Drop file → file = make a folder:** when a file is dropped onto ANOTHER file (not a folder/crumb), open `create-folder-from-files-dialog.tsx`: prompts for a folder name (encrypted via the existing name crypto), creates the folder, and moves BOTH files into it (reuse the existing move/move-with-rekey path so protected-folder rules still hold). macOS/iOS-style merge.

**Multi-select + bulk drag:**
- Mouse: click selects; **⌘/Ctrl-click** toggles; **Shift-click** selects a range; click empty space clears. Works in both list + grid.
- Keyboard (accessibility): roving focus with **↑/↓** (list) / arrows (grid), **Space** toggles selection, **Shift+↑/↓** extends the range, **⌘/Ctrl+A** select all, **Esc** clears, **Enter** opens the focused file. Maintain `aria-selected` + visible focus ring.
- **Bulk drag:** when ≥2 are selected and you drag one, drag the WHOLE selection as a **stacked ghost** showing the count ("4 items"); dropping on a folder/crumb moves them all (reuse the move path, each re-keyed if crossing a protection boundary). Bulk bar stays.

Keep all existing explorer behavior (sort, search, breadcrumb, folder DnD, kebab actions, protected-folder flows) working.

---

## OWNER 3 — Deleted Files actions  (owns `components/files/trash-content.tsx` + the `/trash` page if needed)

Depends on OWNER 1 (FileViewer + useFileDecryptor for preview).
- Per-row actions (kebab or inline): **Restore**, **Delete forever** (confirm), and **Preview** (open `<FileViewer>` read-only — no move/delete from inside it). Match the explorer's row styling + tokens.
- **Selection + bulk:** select multiple deleted files (mouse + the same keyboard model as the explorer if feasible) → **Restore selected** / **Delete forever selected** with a confirm. Empty state, loading skeletons.
- Reuse the existing trash API (`listTrash`/`restoreFile`/`purgeFile`) — confirm names in the contract.

---

## Verify
`cd app/frontend && bun run typecheck` (zero errors) + `bun run build` (compiles) + `bun run lint` (only the known baseline). Fix loop until green.

## Review dimensions
- **Behavior:** every viewer renders its formats; prev/next + fullscreen + keyboard work; tilt drag, file→folder merge, multi-select (mouse+keyboard), bulk drag, trash actions all function; existing explorer flows intact.
- **Security/ZK:** no plaintext/passphrase to server or logs; HTML/markdown/docx sanitized (DOMPurify); HTML iframe sandboxed without scripts; blob URLs revoked; folder-password routing preserved.
- **Accessibility:** viewer dialog focus-trap + roles + keyboard; explorer roving focus / aria-selected; reduced-motion respected on tilt + zoom + transitions; focus-visible rings.
