# Per-Folder Password — Correctness Fixes (from the crypto + behavior reviews)

The crypto/ZK core is sound. These fix real integration bugs found in the behavior review.
Same guardrails as FOLDER_PASSWORD_SPEC.md (ZK sacred; additive nullable migrations only on the
SHARED PROD DB; --color-* tokens; no secret logging). Keep `go build`/`go vet` + `typecheck`/`lint` clean.

Two OWNERS, disjoint by language/dir → no file conflicts. Apply ONLY your section.

---

## OWNER A — BACKEND (Go, app/backend)

**FIX-1a — Atomic folder assignment at upload init (kills the stranding bug).**
Today a protected-folder upload wraps the CEK under the folder password, then files the row into the folder via a separate *best-effort* `moveFile` (`store/upload.ts`). If that move fails, the file sits at Root but is folder-keyed → undecryptable. Fix the root cause: let the file be created in its folder atomically.
- `HandleUploadInit` (cmd/upload.go): accept an optional `folder_id` (string, nullable) in the init request body.
- `InsertFile` (index/queries.go) + its callers: set `files.folder_id` from that value at creation (the column already exists). Validate the folder belongs to the user (ownership) when non-null; ignore/null otherwise.
- Keep it backward compatible: omitted `folder_id` ⇒ NULL (Root), exactly as today.

**FIX-3a — Server-side folder-cycle guard (kills the tree-corruption bug).**
`MoveFolder` (index/folders_queries.go ~128-132) only blocks a direct self-move; the recursive ancestry check is an unaddressed TODO, so a folder can be moved into its own descendant and detach the subtree.
- In `MoveFolder`, before updating, run a recursive CTE (or ancestry walk) that rejects the move when the target `parent_id` is the folder itself OR any descendant of it. Return a clear error (e.g. "cannot move a folder into its own subfolder") that the existing handler surfaces as a 4xx.
- This is the authoritative guard for BOTH the dialog and drag paths.

(Migrations: none needed for these — no new columns. Do not add destructive SQL.)

---

## OWNER B — FRONTEND (TypeScript, app/frontend) — single owner for all TS fixes (avoids conflicts)

**FIX-1b — Use atomic init; drop the best-effort post-move for folder uploads.**
- `store/upload.ts`: pass `folderId` into the upload-init call (`lib/upload-session.ts initUpload` + the init request type) so the file is created in the folder. REMOVE the best-effort post-complete `moveFile` (and its misleading "still decryptable" comment) — the file is now born in the right folder, so there is no stranding window. (`handleFilesSelected`/`startUpload` already know the target folder + use the folder password to wrap when protected — keep that.)
- Confirm `lib/upload-session.ts` threads `folder_id` into the init POST body to match OWNER A's handler.

**FIX-2 — Reject the unlock promise on cancel (kills the hang/silent-failure).**
- `hooks/useFolderProtection.ts`: when the folder-unlock modal is cancelled/closed (`onClose`, ~174-178/216-228), REJECT the pending `passwordForFile`/`withFolderPassword` promise with a typed `FolderUnlockCancelled` error (don't leave it unresolved).
- Callers handle it as "user cancelled": `moveFileWithRekey`/`handleMoveFileTo` (useVaultActions.ts) revert the optimistic move and stop cleanly (no scary error toast — a soft "Move cancelled" is fine); `MoveToFolderDialog` stops the "Moving…" spinner and closes/resets. No stuck state anywhere.

**FIX-4 — Folder-password recovery on download / bulk / retry / resume (kills deterministic failure).**
- `components/transfer/transfer-manager.tsx`: it calls `retryDownload`/`resumeUpload`/`retryUpload` with only the vault passphrase. Thread the folder-aware password through: import the resolver from `useFolderProtection` and resolve the right password (folder password for a protected-folder file, vault otherwise) for the specific item before retry/resume — exactly like the initial download/upload paths do. Resume of a protected-folder upload must use that folder's password.
- `store/download.ts` (single + bulk): route decryption through the same `resolvePassword` resolver the initial download uses, and on a wrong/stale password for a PROTECTED-folder file, clear that folder's cache (`clearFolderPassword`) and surface a re-prompt path — mirror the preview recovery in `useVaultActions.ts:347-362`. Don't just fail with a generic toast.

**FIX-5 — Roll back if the protection-flag persist fails after a re-key sweep.**
- `hooks/useFolderProtection.ts` `protectFolder`/`unprotectFolder`: today files are re-keyed first, then `setFolderPassword`/`removeFolderPassword` is called with no rollback around THAT call. If the API call fails after the sweep, files are already re-keyed while the server still shows the old protection state. Wrap it: if the set/remove API call fails, reverse the sweep (re-key the files back) before throwing, so the folder + its files always end consistent.

**FIX-3b — Surface the backend cycle rejection gracefully.**
- Folder move (dialog `move-to-folder-dialog.tsx` + drag in `vault-explorer.tsx`/`useDragMove`): on the backend "cannot move into its own subfolder" error, show a clear toast and reconcile (`refresh`), reverting any optimistic move. Keep the existing client-side known-descendant block as a fast pre-check, but rely on the backend as the source of truth. Fix the false "the backend also rejects cycles" comment in `move-to-folder-dialog.tsx`.

---

## ACCEPTED (tracked, NOT fixing now — recoverable, not data-loss)
- Crypto (3a): a hard crash mid re-key sweep can leave a folder's files split across old/new passwords. No CEK is ever lost (each file stays decryptable under whichever password last succeeded). A resumable/transactional sweep is a future hardening.
- Crypto (4-ordering): boundary move persists `rekeyFile` before `moveFile`; if `moveFile` fails the file stays in the source folder under the dest password — self-heals (dest password cached + refresh). Reversing the order would be strictly worse.
