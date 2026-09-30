# zcrypt audit: 48 new action items (read-only)

Audited: main at baf2594 (2026-10-01). Paths are repo-relative. Nothing was edited, built or run. Each bug claim was confirmed by reading the cited code. I dropped anything I could not point to a line for. Excluded per your list: share filenames, vault cache, Android update check, hero jank, pad/send/transfer UI, e2e smoke, onboarding tour, in-app bug reports, reviews, Spaces, i18n, backend perf/indexes audit, Oracle migration, npm token, Android signing key.

## Summary

| Type | Count | | Priority | Count |
|---|---|---|---|---|
| bug | 17 | | P0 | 1 |
| security | 16 | | P1 | 18 |
| feature | 7 | | P2 | 26 |
| perf | 2 | | P3 | 3 |
| a11y | 2 | | **Total** | **48** |
| dx | 3 | | | |
| docs | 1 | | | |

Sizes: S = under 1 day, M = 1 to 3 days, L = a week or more.

---

## A. Auth, sessions, access control

**SEC-01 | security | P0 | M | Device Transfer sends the AES key through the relay, so the "server cannot read it" claim is false**
- Evidence: `app/frontend/components/tools/transfer-tool.tsx:107` sends `{ name, size, type, key: toBase64(key) }` in the `file_info` message over the WebSocket. `cmd/transfer.go` relays it. The page copy at `:70-71` says the server "cannot read it". The pairing code is 6 digits (`cmd/transfer.go:generateCode`).
- Impact: the relay operator, or anyone who pairs first, gets the key plus ciphertext plus filename.
- Fix: carry the key out of band (QR payload or URL fragment), or run a PAKE (CPace/SPAKE2) on the 6-digit code. Encrypt the filename too. Add a short confirmation string on both screens.

**SEC-02 | security | P1 | S | Magic-link login skips 2FA**
- Evidence: `app/backend/cmd/auth.go:1343` calls `s.issueTokens(w, r, user)` straight after the email token check. `HandleLogin` (`:286-296`) returns `requires_2fa` for TOTP users, but `HandleMagicLinkVerify` never checks `user.TOTPEnabled`.
- Impact: email access alone defeats an enrolled second factor.
- Fix: if `TOTPEnabled`, return a temp token and route through `Handle2FAVerify`.

**SEC-03 | security | P1 | S | OAuth login and auto-link skip 2FA**
- Evidence: `cmd/oauth.go:184, 208, 253` all call `oauthRedirect` (`:391`), which mints full tokens with no `TOTPEnabled` check.
- Impact: a linked or same-email Google/GitHub account bypasses 2FA.
- Fix: issue a 2FA challenge for TOTP users, including the desktop poll path.

**SEC-04 | security | P1 | M | Desktop OAuth poll allows session fixation and token theft**
- Evidence: `cmd/oauth.go:55-67` lets the caller choose the poll `session`. The start URL is a plain GET that sets the state cookie, so an attacker can craft one with their own session id. `:421` stores the victim's tokens under that session, and `:478` hands them to whoever polls it.
- Impact: a victim who clicks a crafted link and logs in with Google gives the attacker a full access and refresh token.
- Fix: PKCE style. The desktop app keeps a secret verifier, sends only its hash at start, and the poll must present the verifier. Optionally show a confirmation code in both places.

**SEC-05 | security | P1 | M | Decoy (duress) sessions are isolated in only 3 handlers**
- Evidence: `IsDecoy` is checked only in `cmd/list.go:31`, `cmd/folders.go:267` and `cmd/analytics.go:90,135,164`. Every other route treats a decoy JWT as the real user: file meta and chunks, trash, notes, shares, platform status, quota, and `/api/auth/me` (which returns the email). `AdminMiddleware` (`cmd/auth_middleware.go:79-87`) ignores `Decoy`, so an admin's decoy token reaches admin routes.
- Impact: a coerced login can expose or destroy real data, which defeats plausible deniability.
- Fix: default-deny middleware for decoy claims with a small allowlist, and have `AdminMiddleware` reject decoy tokens. Add tests that enumerate every route in `RegisterRoutes`.

**SEC-06 | bug | P1 | M | Refresh rotation race logs users out across tabs**
- Evidence: `cmd/auth.go:315-352` reads the token, then deletes it. There is no atomic consume, no grace window and no reuse detection. `app/frontend/lib/auth-fetch.ts:17-45` dedupes refreshes only within one tab. A second tab presenting the just-rotated cookie gets 401 and runs `clearAuth()` (`:37-38`), which wipes the shared `localStorage` access token.
- Impact: two tabs waking after sleep randomly sign the user out.
- Fix: serialise refreshes with `navigator.locks` and a BroadcastChannel. On the server use `DELETE ... RETURNING`, keep a 10 to 30 second grace for the previous token, and revoke the whole token family on true reuse.

**SEC-07 | bug | P1 | M | Desktop: the webview and the Rust core both rotate the same refresh token**
- Evidence: `app/desktop/src-tauri/src/lib.rs:492-503` persists rotated tokens to the OS keychain only. The webview keeps its own copy (`app/frontend/store/auth.ts:108-110`) and refreshes independently through `tryRefreshToken`. Whichever refreshes second gets 401, and the JS side then calls `clearAuth()`. Separately, `app/core/src/api/client.rs` (`refresh`) returns `ApiError::Unauthorized` for any non-2xx, including 5xx and 429.
- Impact: desktop users are randomly logged out, and background sync aborts on a transient auth-server blip.
- Fix: make the Rust core the only refresher and expose it through `invoke`, or emit an event on rotate that JS adopts. Map 5xx and 429 to a retryable error.

**SEC-08 | security | P1 | S | The vault passphrase is persisted on the device by default**
- Evidence: `app/frontend/store/passphrase.ts:22-24` reads `localStorage.getItem(REMEMBER_KEY) !== "0"`, so the default is ON. `lib/device-vault.ts` stores the AES-GCM key in the same IndexedDB as the ciphertext, and makes it extractable in Tauri. The file header calls this "strictly the user's opt-in choice".
- Impact: on shared or stolen machines the zero-knowledge vault is permanently unlocked, and the stored key gives no real protection against local access.
- Fix: default OFF on web, and ask explicitly at first unlock. On desktop use the existing `keychain_*` commands plus biometrics. Correct the comment and docs.

**SEC-09 | security | P1 | S | Tauri webview has no CSP and exposes unvalidated filesystem commands**
- Evidence: `app/desktop/src-tauri/tauri.conf.json:34` has `"csp": null`. `src-tauri/src/lib.rs:994` `remove_temp_file(path)` deletes any path it is given. `:987` `write_temp_file(name)` does not sanitise `name`. `download_file(save_path)` writes wherever the webview says.
- Impact: any XSS in the webview (which holds the keys) becomes arbitrary file deletion and overwrite on the user's machine.
- Fix: set a CSP equivalent to the web one. Canonicalise paths and confine them to the `zcrypt-<pid>-` temp prefix. Drop `fs:allow-remove` and narrow the scopes.

**SEC-10 | security | P2 | M | Web CSP is Report-Only with no reporting, and previews can load remote resources**
- Evidence: `app/frontend/next.config.ts:39-42` is Report-Only unless `CSP_ENFORCE=1`, and there is no `report-uri` or `report-to`, so violations are never collected. `script-src` has `'unsafe-inline'`. `components/viewers/html-viewer.tsx` uses `sandbox=""`, which blocks scripts but not remote images or CSS. Markdown images behave the same way.
- Impact: opening a received HTML or markdown file can ping a tracker and reveal the viewer's IP and open time, and XSS has no backstop.
- Fix: add a report endpoint, enforce the policy, move to nonce plus `strict-dynamic` on web, and add `img-src`/`style-src` restrictions to the iframe via `<meta>` CSP in the srcdoc.

**SEC-11 | security | P2 | M | Access token exposure: SSE query-string token, no revocation check, and a `localStorage` access token**
- Evidence: `cmd/events.go:15-27` takes `?token=<jwt>` (it lands in proxy logs). It calls only `ValidateAccessToken` and skips the `tokenVersions` check that `auth_middleware.go:32-40` does, so revoked tokens still stream. The stream outlives token expiry. `main.go` `exemptLongLived` skips rate limits and `pipeline/progress.go:36-47` has no per-user cap. The web access token sits in `localStorage` (`store/auth.ts:107`).
- Impact: log leakage, revocation bypass, unbounded connection DoS, and XSS can exfiltrate a live token.
- Fix: issue a single-use SSE ticket from an authenticated POST. Check the token version. Cap connections to about 5 per user and close at expiry. Hold the web access token in memory only.

**SEC-12 | security | P2 | S | Login limiter causes lockout DoS and shared-bucket starvation, and limiter maps leak memory**
- Evidence: `emailLimiter` (3 per 15 min, `cmd/server.go:155`) is shared by login (`auth.go:260`), forgot-password (`:391`), resend-verification (`:563`) and magic-link (`:1252`). It counts successful attempts and is keyed on the attacker-supplied email. Stale-entry cleanup exists only in `RateLimitMiddleware` (`cmd/ratelimit.go:60-82`), so the Server limiters' maps grow with arbitrary keys forever.
- Impact: anyone can lock a victim out with 3 bad logins. A legitimate 4th login in 15 minutes is refused. Requesting a reset consumes login budget. Memory grows under attack.
- Fix: count only failures, key on (email, IP), use separate buckets, and add a TTL sweep.

**SEC-13 | security | P2 | S | Re-auth gaps on sensitive actions**
- Evidence: `cmd/auth.go:978-983` `Handle2FADisable` checks the password before `twoFAUserLimiter` and has no IP limiter, so it is a password oracle for a stolen access token. `cmd/admin.go:164-178` changes roles with no `reauthActingUser`, unlike delete (`:214`). Enabling or disabling 2FA does not revoke other sessions.
- Impact: a stolen admin token can mint more admins. A stolen token can brute-force the password.
- Fix: limiter first, require password plus TOTP for role and platform-token changes, and bump `token_version` on 2FA changes.

**SEC-14 | bug | P2 | S | Passwords longer than 72 bytes fail with a 500**
- Evidence: `auth/password.go:6` uses bcrypt, and x/crypto v0.57 returns `ErrPasswordTooLong`. `cmd/auth.go:182` turns that into `{"error":"internal error"}`. `validatePassword` (`:64`) has no maximum. Reset and change-password share the path.
- Impact: passphrase-style and password-manager passwords cannot register, reset or change.
- Fix: versioned SHA-256 prehash before bcrypt, or a clear 400 at a documented maximum.

**SEC-15 | bug | P2 | S | Swallowed errors in token and password writes**
- Evidence: `cmd/auth.go:1437` and `cmd/oauth.go:404` ignore `InsertRefreshToken` errors. `cmd/auth.go:499` ignores `UpdateUserPassword`, then deletes the reset token and returns `{"success":true}`. The token-version bump failure in change-password is only logged.
- Impact: users get tokens that cannot refresh, or are told a reset succeeded when it did not (and the link is now burned).
- Fix: check each error and return 500 before any destructive follow-up.

**SEC-16 | security | P2 | S | Move and pin endpoints do not validate the target**
- Evidence: `index/folders_queries.go:286` (`MoveFile`) and `:227` (`MoveFolder`) set the parent or folder to any UUID with no ownership or live check, and ignore `RowsAffected`. The cycle check (`:203-225`) is not transactional. `index/offline_queries.go:10` (`PinFileOffline`) never checks file ownership.
- Impact: a file can be moved under another user's folder id and vanish from the owner's tree. A non-UUID gives a 500, a missing id reports success, and concurrent moves can create a cycle.
- Fix: validate the destination inside the same statement (`EXISTS` on user and `deleted_at IS NULL`), lock the subtree, and return 404 or 400.

**SEC-17 | security | P1 | M | Shared-pool quota can be bypassed**
- Evidence: `cmd/upload.go:199-205` compares the client-declared `original_size` to quota. `chunk_count` is only checked `> 0` (`:77`) and is not reconciled with size or `chunk_size`. Chunks are capped only at 17 MiB each (`:32`). `UpdateFileOriginalSizeVerified` (`index/queries.go:1407`) writes `encrypted_size`, while quota sums `original_size` (`index/auth_queries.go:332`). Concurrent inits also race the check.
- Impact: declare 1 byte, upload gigabytes onto the admin-token-funded managed pool.
- Fix: at complete, require the summed chunk bytes to be at most the declared size times an overhead factor. Reserve quota atomically at init. Bound `chunk_count` by `ceil(size / chunk_size)`.

**SEC-18 | security | P2 | S | Public share links keep working after the file is trashed**
- Evidence: `GetFileByIDUnsafe` (`index/queries.go:1418`) has no `deleted_at` filter. `HandleDeleteFile` (`cmd/delete.go:12-37`) and the bulk delete never touch shares.
- Impact: a user who trashes a file believing it is gone still has it downloadable by link.
- Fix: make share validation join a live file, or revoke on soft-delete and restore on un-delete. Apply the same to folder shares.

**SEC-19 | security | P2 | S | Android window is screenshot- and recents-visible**
- Evidence: `app/desktop/src-tauri/android/MainActivity.kt` sets edge-to-edge and insets only. There is no `FLAG_SECURE`.
- Impact: decrypted previews appear in the app switcher and screenshots or screen recordings.
- Fix: set `WindowManager.LayoutParams.FLAG_SECURE` by default, with a setting to relax it.

**SEC-20 | security | P3 | S | Error-handling hygiene and cheap hardening**
- Evidence: 21 sites use `fmt.Sprintf(\`{"error":"%s"}\`, err)` (for example `cmd/admin.go:468` on the user route `HandleGetQuota`, and `:616`). They leak DB errors and produce invalid JSON when the error contains a quote. `http.Error` also labels them `text/plain`. `cmd/server.go:684-685` (PATCH profile, change-password) lack `maxJSON`. The refresh cookie is `SameSite=None` (`auth.go:1363-1370`) with no Origin check, so logout and refresh can be triggered cross-site.
- Impact: information disclosure, malformed responses, memory DoS by an authenticated user, and logout CSRF.
- Fix: one `writeError(w, code, msg)` helper that logs the real error, wrap all JSON routes in `maxJSON`, and check `Origin`/`Sec-Fetch-Site` on cookie-authenticated POSTs.

---

## B. Data integrity and correctness

**DATA-01 | bug | P1 | M | The sync worker burns all 8 retries within seconds, then silently abandons chunks**
- Evidence: `cmd/sync_worker.go:127` loops `for s.syncPendingChunks(ctx)`. `index/queries.go:1225-1229` re-selects failing chunks immediately (`ORDER BY sync_attempts`), and there is no `next_attempt_at` or backoff. After `maxSyncAttempts = 8` (`:49`) the chunk is only logged as "NOT durable". The file is already `complete` (`cmd/upload.go:543`).
- Impact: a 10 second GitHub or HF outage permanently strands chunks while the UI shows healthy files. This is a likely source of the "synced but 404" loss.
- Fix: add `next_attempt_at` with exponential backoff and jitter, and pause per platform on 429 or 5xx. Mark affected files `degraded`, show it in the UI, alert admins, and offer a retry action.

**DATA-02 | bug | P1 | L | Files whose chunks are missing on the platform are invisible and unrepairable (the documented HF 404 loss)**
- Evidence: `cmd/reconcile.go` reports only orphan blobs (extra on platform), never DB chunks missing from the platform. `adapters/huggingface.go:264-266` returns a generic error, and `cmd/download.go:159-163` maps it to a 500 "failed to download chunk", which the client retries 5 times. The UI ends at "preview unavailable" (`app/frontend/hooks/useThumbnail.ts` hard-fail). `docs/TEST_COVERAGE_ROADMAP.md:90` records about 237 affected files.
- Impact: users cannot tell a damaged file from a network glitch and have no path to repair.
- Fix: add an adapter `ErrNotFound` sentinel, return 410 and set `files.health='damaged'`. Add a user-run "Verify my files" job (`ListChunks` diff) with a damaged badge, a re-upload prompt and an admin report.

**DATA-03 | bug | P1 | M | Upload confirm trusts client-supplied `remote_path` and `committed`**
- Evidence: byos-direct at `cmd/upload.go:989-1036` stores `RemotePath: req.RemotePath` and marks the chunk committed from the client's claim (`InsertDirectChunk`). The presign/relay path (`:1042-1054`) also accepts any `remote_path`, while presign mints a random path that is never persisted.
- Impact: a failed HF commit on the client is recorded as durable, and a chunk can point at the wrong blob.
- Fix: persist the planned path at presign and require equality at confirm. After complete, have the server spot-check existence with the user's stored token (`ListChunks`/HEAD) before treating byos-direct chunks as verified.

**DATA-04 | bug | P1 | M | Move-with-rekey across a password-protected folder is not atomic**
- Evidence: `app/frontend/hooks/useVaultActions.ts:549-550` calls `rekeyFileForMove` and then a separate `moveFile`. If the move fails, the file is keyed for the destination zone while still in the source folder, so it will not decrypt. The revert only fixes the UI. The `protectFolder` sweep (`useFolderProtection.ts:335-375`) has the same exposure if the tab closes mid-sweep.
- Impact: real files become undecryptable after a flaky request.
- Fix: extend `PATCH /api/files/{id}/move` to accept `{salt, wrapped_cek}` and apply both in one transaction. Add a bulk variant for folder protection.

**DATA-05 | bug | P1 | S | `max_downloads` is off by one: the last allowed download fails**
- Evidence: `cmd/shares.go:251` increments the count on `/meta`. The chunk endpoint runs `validateShare` (`:293`), which rejects when `DownloadCount >= MaxDownloads`. The web client calls meta first (`app/frontend/lib/api.ts:1080`, then chunks at `:1096`). With `max_downloads=1`, the single download returns 403 on its first chunk. Reloads and retries also burn the count.
- Impact: expiring or one-time links do not work as promised.
- Fix: count on completion (final chunk or a dedicated complete call), or issue a short-lived download ticket at `/meta`. Fix folder shares the same way.

**DATA-06 | bug | P1 | S | The Security activity panel 403s for every non-admin**
- Evidence: `cmd/server.go:686` registers `GET /api/auth/activity` with `AdminMiddleware`, but the handler (`cmd/admin.go:607-625`) returns "the authenticated user's own" events. `app/frontend/components/settings/security-activity.tsx:57-63` reads `query.data ?? EMPTY` and never renders the error, so users see "No activity yet".
- Impact: the account security-monitoring feature silently does not work for non-admins.
- Fix: use `AuthMiddleware`, render an error state, and map the full set of event types to labels.

**DATA-07 | bug | P1 | S | Graceful shutdown exits before it drains**
- Evidence: `main.go:112` calls `srv.Shutdown`, which makes `ListenAndServe` (`:158`) return `ErrServerClosed` immediately. `main()` then returns and the process exits while `Shutdown` waits. SSE connections would also hold it for the full 30 seconds if it did wait. There is no done channel.
- Impact: every Railway deploy cuts in-flight chunk uploads and the post-complete background work in `HandleUploadComplete`.
- Fix: block `main` on a shutdown-complete channel and cancel SSE and WebSocket contexts through `BaseContext` so the drain finishes quickly.

**DATA-08 | bug | P2 | S | Chunk PUT failures with JSON 5xx bodies are never retried**
- Evidence: `app/frontend/lib/upload-session.ts:192` throws `new Error(parsed.error)`, which drops the HTTP status. `store/upload.ts:450-458` and `lib/retry.ts:22` decide "transient" by message text (`/\b5\d\d\b/`). Server errors such as `{"error":"upload failed"}` or `"failed to store chunk"` (`cmd/upload.go` staging and insert paths) match nothing.
- Impact: one server hiccup fails a multi-GB upload instead of retrying.
- Fix: throw a typed `HttpError{status}` and retry on 408, 429 and 5xx by status code.

**DATA-09 | bug | P2 | S | `upload complete` is not idempotent**
- Evidence: `cmd/upload.go:524` returns 400 "upload session is not active" once the session is complete. The client wraps the call in `withRetry` (`store/upload.ts:1043`), so a lost response makes the retry fail a finished upload.
- Impact: a completed upload can show as failed, which invites a duplicate upload.
- Fix: return 200 with the same body when the session is already completed and the file is complete.

**DATA-10 | bug | P2 | S | Staging and cache hygiene: leaked staging files, non-atomic, unverified cache writes**
- Evidence: `cmd/upload.go:438` writes the staged `.enc`, then `:458` `InsertClientChunk`. When `inserted == false` (`index/queries.go:1158`, `ON CONFLICT DO NOTHING`) the file is never removed. `cmd/chunk_cache.go:57` uses `os.WriteFile` straight to the final name with no temp file or rename, and `download.go:162` / `shares.go:381` cache without checking `chunk.SHA256`. Entries are served as `immutable`.
- Impact: disk fills under retries. A crash or concurrent read yields a truncated cached chunk that fails the client hash check forever.
- Fix: delete the staged file when not inserted. Write to a temp file and rename. Verify SHA-256 before caching and on read.

**DATA-11 | bug | P2 | M | The file list silently truncates at 10,000 files**
- Evidence: `cmd/list.go:17-18` sets default and max to 10000, and `ListFiles` uses `ORDER BY created_at DESC LIMIT`, so the oldest files are dropped with no flag. The `filter` (`index/queries.go:204`) matches `original_name`, which is empty for zero-knowledge files, and does not escape `%` or `_`.
- Impact: large vaults lose files from the UI with no signal.
- Fix: keyset pagination with a total count, or at minimum a `truncated` flag and banner. Remove or fix the dead `filter`.

**DATA-12 | bug | P2 | S | SSE reconnect reuses an expired token and there are 3 EventSources per tab**
- Evidence: `app/frontend/hooks/useFileEvents.ts:46-76` and `useOperationStatus.ts:39` reconnect via `createEventSource()` (`lib/api.ts:632-636`), which reads whatever token is in the store. After 15 minutes idle or asleep it 401s every 30 seconds, and nothing calls `tryRefreshToken`. After 8 failures the user gets a "Lost connection" toast (`ERROR_THRESHOLD`). `components/tools/devices-tab.tsx:220` opens a third stream. The `/api/changes` catch-up is still a TODO in `useFileEvents.ts`.
- Impact: live sync stops after idle, with a misleading outage warning.
- Fix: refresh the token before reconnecting, share one EventSource, and use `/api/changes` with a cursor for catch-up.

**DATA-13 | bug | P2 | M | Firefox and Safari fall back to in-memory assembly for multi-GB downloads**
- Evidence: `app/frontend/store/download.ts:349` streams to disk only when `showSaveFilePicker` exists (Chromium). Otherwise it silently buffers the whole file, and the upload cap is 10 GiB (`cmd/upload.go:38`).
- Impact: the tab crashes on big downloads with no warning.
- Fix: stream through a service worker or OPFS, or warn and block above about 1 GB and point to the desktop app.

**DATA-14 | perf | P2 | M | Bulk ZIP holds everything in memory, flattens folders, and aborts on the first failure**
- Evidence: `app/frontend/lib/bulk-download.ts:65-163` keeps all plaintext in `zipEntries`, then a second copy via synchronous `zipSync`. Entry names are just `file.filename`, so folder structure is lost and a name like `../x` is preserved unsanitised. Any integrity error throws the whole job.
- Impact: out-of-memory and UI freezes on moderate selections, and "download folder" is impossible.
- Fix: streaming zip (fflate `Zip` or client-zip) into a disk writer, with folder paths preserved, names sanitised, and a per-file skip with a report.

---

## C. Features and platform parity

**FEAT-01 | feature | P1 | L | The TUI speaks the legacy file format and cannot read current web uploads**
- Evidence: `app/tui/internal/api/types.go:88-93` sends a plaintext `filename` with no `wrapped_cek`, `encrypted_name` or `sha256_scheme`. `internal/pipeline/upload.go` and `download.go:55-64` derive the key directly from passphrase plus salt. Web files use an envelope, so they will not decrypt, and their sealed names show blank. `download.go:52` buffers every chunk in memory. `find app/tui -name '*_test.go'` returns 0, yet CI runs `go test ./...` for it.
- Impact: the terminal client stores filenames in plaintext on the server and cannot open most files.
- Fix: implement the envelope and name sealing per `docs/CRYPTO_FORMAT.md`, validate against `app/core/tests/conformance.rs` vectors, stream to disk, and add tests.

**FEAT-02 | feature | P1 | M | No self-serve account deletion or data export**
- Evidence: `app/frontend/app/(marketing)/privacy/page.tsx:203` and `terms/page.tsx:166` promise deletion within 30 days, but the only delete route is admin-only (`DELETE /api/admin/users/{id}`, `cmd/server.go` admin block). The frontend has no delete-account UI.
- Impact: a legal and GDPR gap, and users cannot leave.
- Fix: `DELETE /api/auth/me` with password plus TOTP re-auth and a grace period, reusing `DeleteUser` and the deletion queue, plus a metadata export.

**FEAT-03 | feature | P2 | M | No session and device management**
- Evidence: refresh tokens store IP and user agent (`cmd/auth.go:1437-1444`), and `cmd/clientip.go` says "the Devices page shows it", but no list or revoke endpoint exists (none in `RegisterRoutes`). Only a password change signs everything out.
- Impact: a user with a lost phone cannot revoke that one session.
- Fix: `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`, a "sign out everywhere" button, and a new-device email.

**FEAT-04 | feature | P2 | M | Biometric unlock exists only on macOS**
- Evidence: `app/desktop/src-tauri/src/lib.rs:915-925` returns `Ok(false)` on non-macOS.
- Impact: Windows and Android users cannot use Windows Hello or fingerprint to unlock the vault.
- Fix: Windows Hello via the `windows` crate and Android BiometricPrompt via a Tauri plugin, gating the device-vault key.

**FEAT-05 | feature | P2 | M | Android has no "Share to zcrypt" target**
- Evidence: `android/MainActivity.kt` handles only insets, with no `ACTION_SEND` or `SEND_MULTIPLE` handling anywhere in the repo.
- Impact: the most common mobile upload path (share from Gallery or Files) is missing.
- Fix: add intent filters through the `device.yml` manifest patch and a handler that feeds the upload queue.

**FEAT-06 | feature | P2 | L | "Offline pins" is metadata only, so there is no offline mode**
- Evidence: `app/frontend/components/tools/devices-tab.tsx:76-80` only calls `/api/offline`. There is no service worker or cache in the frontend (`public/` has none). `offline_pins.file_id` has no FK (`index/schema.go:708-714`).
- Impact: pinned files are not available offline, which misleads users.
- Fix: cache ciphertext in OPFS or IndexedDB via a service worker on web, and local SQLite in the desktop core. Drive pin state from the cache and refresh via `/api/changes`.

**FEAT-07 | feature | P2 | L | No file versioning**
- Evidence: there is no versions table in `index/schema.go`. A re-upload becomes a separate file, and snapshots are vault-wide only.
- Impact: there is no "restore previous version" and edits consume quota as duplicates.
- Fix: `file_versions(file_id, rev, chunks...)`, an "upload new version" action, a version list with restore, and quota accounting.

**FEAT-08 | perf | P2 | M | Thumbnails decrypt the whole file**
- Evidence: `app/frontend/hooks/useThumbnail.ts:13-16` fetches and decrypts up to 15 MB per 300 px tile, 3 at a time.
- Impact: grids burn bandwidth and CPU, and the first view is slow.
- Fix: generate a small encrypted thumbnail sidecar at upload time and fetch only that for the grid.

---

## D. Accessibility and UX

**A11Y-01 | a11y | P2 | M | Hand-rolled modals lack dialog semantics and focus management**
- Evidence: `components/ui/file-preview-modal.tsx:141`, `passphrase-modal.tsx:166`, `confirm-modal.tsx:96` and `bottom-sheet.tsx` use `createPortal` with no `role="dialog"` or `aria-modal`. There is no focus trap and no focus return to the trigger, and the background is not inert. Radix Dialog (`ui/dialog.tsx`) is already in the project.
- Impact: screen-reader and keyboard users can tab behind modals and lose their place.
- Fix: migrate these to Radix Dialog or Sheet, with `aria-labelledby` and focus restore.

**A11Y-02 | a11y | P3 | S | Explorer ARIA, theme contrast and keyboard discoverability**
- Evidence: `components/files/explorer/explorer-row.tsx:254-255` and `explorer-card.tsx:205-206` put `aria-selected` on `role="button"`, which is invalid. There is no live region for selection counts or bulk results. `app/(app)/error.tsx:23` hardcodes `text-white`, which is unreadable in the light theme. `components/ui/command-palette.tsx:57` shows "Admin" to everyone and `:104` caps files at `slice(0, 200)`. `vault-explorer.tsx:566-625` handles arrows, Space, Enter, Esc and Ctrl+A only, with no Delete, F2 or "?" shortcut help.
- Impact: a less accessible and less discoverable keyboard experience.
- Fix: use `aria-pressed` or listbox/option roles, add `aria-live` status text, use theme tokens, gate the Admin entry, and add a shortcuts dialog plus Delete and F2.

---

## E. Observability, CI and docs

**OBS-01 | dx | P2 | M | Logging is unstructured, metrics and error tracking are absent, and the logged IP is wrong**
- Evidence: there are 221 `log.Printf` calls versus 5 `slog` in `cmd/`. `main.go:202` logs `r.RemoteAddr` (the proxy address) rather than `clientIP`, and there is no request id. No Sentry, Prometheus or expvar anywhere in the repo. The frontend `error.tsx` only calls `console.error`.
- Impact: incidents (such as DATA-01) cannot be seen or alerted on.
- Fix: JSON `slog` everywhere with a request id and real client IP. Add a `/metrics` endpoint (sync queue depth, abandoned chunks, SSE subscribers, limiter rejects, 5xx rate) and Sentry for frontend and Rust.

**DX-01 | dx | P2 | S | Security scanning gaps in CI**
- Evidence: `.github/workflows/security.yml` runs govulncheck weekly only, installed `@latest` (unpinned). `gitleaks` has `continue-on-error` (`:57`). There is no `cargo audit` or `deny` for `core`/`desktop` and no JS dependency audit. Backend coverage is uploaded without a gate (`ci.yml:93-99`). The `tui` job runs `go test` on zero tests (`ci.yml:360`).
- Impact: known CVEs and leaked secrets can merge unnoticed.
- Fix: pin tools, add `cargo deny` and `bun audit`, make gitleaks blocking, and set coverage floors per module.

**DX-02 | dx | P2 | L | The Rust data plane has no integration tests**
- Evidence: `app/core/Cargo.toml:59` has an empty `[dev-dependencies]`. `docs/TEST_COVERAGE_ROADMAP.md:82-100` states `sync`, `stream_upload`, `download` and `decrypt_to_memory` are at 0%.
- Impact: bugs like DATA-01 and DATA-03 ship undetected.
- Fix: add `wiremock` and `tempfile`, then write the planned regression test for a chunk marked synced but absent, plus token-refresh and retry tests.

**DX-03 | docs | P3 | S | Docs and version drift**
- Evidence: `CLAUDE.md` says Go 1.25, but `app/backend/go.mod:3` is 1.26.0 (toolchain 1.26.6). It lists a backend `compression/` directory that does not exist, and describes `chunks/` as splitting and merging when it holds only `verify.go`. `tauri.conf.json:4` is 0.1.6 while `app/desktop/src-tauri/Cargo.toml` is 0.1.0 and `app/frontend/package.json` is 0.2.0. `docs/SECURITY.md` scope names backend, frontend and TUI only, omitting desktop, Android and core, and the contact is a personal Gmail.
- Impact: contributors and researchers get wrong guidance.
- Fix: update the docs, add a version-sync check in CI, and add a `security@` address or GitHub private advisories.

---

### Highest-leverage order
1. **Ship now:** SEC-01, SEC-02 and SEC-03 (E2EE and 2FA claims), SEC-04, DATA-05 and DATA-06 (plain bugs, small fixes), DATA-07.
2. **Next:** DATA-01 to DATA-04 together (durability), SEC-05, SEC-06 and SEC-07 (auth stability), SEC-08 and SEC-09.
3. **Then:** SEC-17, FEAT-01 and FEAT-02, followed by the P2 list.

