# zcrypt — Authenticated App Redesign (tracked plan)

> ## ✅ SHIPPED (2026-06-24) — verified: `typecheck` clean, no new lint errors, `next build` passes.
> Foundation + paneled light/dark shell, ⌘K search, nested encrypted folders, Trash, drag-and-drop + nested move picker, details drawer (Details + Sharing), Quick Access, decluttered Vault, media player, and the full redesign fanned out to analytics/notes/settings/share/tools/admin.
> **Action required on your side:** restart the Go backend on :8080 to apply the additive folders/trash migrations to the Neon DB.
> **Deferred follow-ups:** encrypted file-name migration for existing files (needs a backend set-file-name endpoint + upload-flow change); per-file Activity feed (needs a backend per-file events source); drag-drop deep-descendant cycle guard (currently relies on backend rejection + reconcile). Pre-existing (not from this work): the `react-hooks/exhaustive-deps` eslint "rule not found" baseline errors.


Goal: rebuild the authenticated app (`app/(app)/`) into a clean, light-first,
Proton/Apple-clean **encrypted Google-Drive** — nested folders, drag-and-drop,
trash, working search, shared-file tracking, details drawer — **while keeping
zero-knowledge encryption intact**. Marketing + auth pages are out of scope.

Reference: user-supplied "minecloud" file-manager screenshots (paneled light
layout, left views nav, Quick Access cards, file table, right details drawer
with Activity/Sharing/Versions). Accent stays zcrypt cyan/teal (not the ref blue).

## Decision log
- **SSR model:** Server-Component shells + client data islands (JWT is in
  localStorage; never fetch authed data server-side; Tauri static-export safe).
- **Theme:** light-first, both polished; tokens scoped to `.app-shell` so
  marketing/auth are untouched.
- **Encryption motif:** subtle only (lock indicator), no cipher textures.
- **Folder/file names — OPEN (defaulting to plaintext):** `files.original_name`
  is ALREADY stored plaintext today, so folders/search/sort can work server-side
  with plaintext folder names at no loss vs the current posture. Full
  name-encryption (true ZK metadata) is a separate hardening track. CONFIRM if
  you want encrypted names instead (forces client-only listing/search).

## Status legend: [x] done · [~] in progress · [ ] todo · (BE)=backend (FE)=frontend

### Phase 0 — Foundation  [x]
- [x] shadcn/ui installed + tailwind token bridge + `tailwindcss-animate`
- [x] 28 primitives; custom Button/Input/Skeleton preserved
- [x] Paneled light/dark shell: layout, sidebar (+storage card), top bar
- [x] File table reskinned (clean rows, sort, per-row kebab menu)
- [x] Vault defaults to table view

### Phase 1 — Working search  [~]
- [~] (FE) ⌘K command palette: search files + quick-nav (replaces stale search)

### Phase 2 — Folders (nested)
- [x] (BE) `folders` table: id, user_id, parent_id (nullable, nested), encrypted_name, created_at, deleted_at; `folder_id` (nullable) on `files`
- [x] (BE) endpoints: create / rename / move / delete(soft, cascades) folder; move file to folder; `ListFilesInFolder`
- [x] (FE) data layer: store/folders.ts, hooks/useFolders.ts, lib/name-crypto.ts (encrypted names), api client + types
- [x] (FE) browser UI: components/files/folder-browser.tsx — breadcrumb nav, folder grid, new/rename/delete, open-to-nest; Vault filters files by current folder
- [x] (FE) move file to folder: kebab "Move to folder" + move-to-folder-dialog.tsx (top-level picker)
- NOTE: backend migrations apply on next Go-backend RESTART (shared prod Neon DB). Until then /api/folders 404s and the browser shows empty. Names are ENCRYPTED client-side (need passphrase unlock to read; else "[locked]").

### Phase 3 — Drag & drop  [ ]
- [ ] (FE) drag files/folders onto a folder row or breadcrumb to move (optimistic + reconcile)
- [ ] (FE) full-tree move picker (current picker is top-level only)

### Phase 4 — Trash / Deleted Files
- [x] (BE) `deleted_at` on files + folders; default delete is now SOFT; `/purge` for permanent; list-trash / restore endpoints; deleted excluded from normal listing
- [x] (FE) Deleted Files view at /trash (sidebar entry) with restore + permanent-delete; delete-confirm copy updated to "moved to Trash"

### Phase 5 — Details drawer  [ ]
- [ ] (FE) right drawer on row-select: Details (size, chunks, SHA, platforms via getFileMeta, AES-256 lock), Sharing (links/members), Activity (events). Replaces file-preview-modal as the primary detail surface.

### Phase 6 — Quick Access + page declutter  [ ]
- [ ] (FE) Quick Access card row (recent files / pinned folders)
- [ ] (FE) move upload zone into an "Upload" button + modal; restructure page

### Phase 7 — Sharing & activity tracking  [ ]
- [ ] (BE/FE) surface share_links + shared_vault membership per file; per-file activity from audit/events

### Phase 8 — Media player  [ ]
- [ ] (FE) audio/video player for decrypted previews (+ playlist)

### Phase 9 — Top nav option  [ ]
- [ ] (FE) evaluate horizontal top nav (Files/Activity/… style) vs left-sidebar IA

### Phase 10 — Fan out  [ ]
- [ ] (FE) apply the system to analytics, notes, settings(+deadman/decoy), share, tools, admin(+subpages) — orchestrated workers, one per disjoint route

## Always: keep zero-knowledge intact (no plaintext content/passphrase off-device, authedFetch for all authed calls, nothing secret into RSC/metadata).
