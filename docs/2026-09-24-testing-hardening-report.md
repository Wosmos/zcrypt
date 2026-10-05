# zcrypt Testing Pass & Hardening Report — 2026-09-24

Status: integration/chaos Go test suite still executing at time of writing (see §5, marked IN PROGRESS). Everything else below is complete and verified.

## 0. Executive summary

Ran a full pass across e2e, load, "system design" (integration + chaos), and security testing, following today's live Neon DB rotation. Two findings are urgent and independent of everything else:

1. **Confirmed, quantified production data-loss window in the Neon rotation carousel.** The documented write-freeze (`docs/DB_SCALING_100_PROJECTS.md` §6.1) was never implemented in `scripts/neon-rotate.sh`. A local drill reproducing the exact dump→restore→verify→cutover sequence lost **15 of 20 writes (75%)** in a 3.3s window, with the health-gate reporting success anyway. This ran for real in production today.
2. **A Neon-password-shaped secret (`npg_...` prefix) is sitting in git history** (`.claude/settings.local.json`, commit `424c7d9`, 2026-03-09) — gone from the working tree, still reachable by anyone who clones full history. Status unverified — needs a human to check if it's still live.

Everything else: e2e suite runs (6/10 pass; the 4 failures are a real, pre-existing UI/test drift bug, not a today-regression); a Dockerized load-test sandbox now exists so k6 can run stress/soak safely without ever touching prod; security posture is better than a stale internal note suggested (2FA brute-force is actually well-defended); two real open architectural security items remain (token storage, key rotation).

---

## 1. Critical/urgent (independent of the rest of this report)

### 1.1 Neon cutover race — data loss, reproduced and quantified
- **What**: `scripts/neon-rotate.sh` goes straight from a reachability check to `pg_dump` on a *live, still-writable* database, then spends real minutes on restore+verify+ANALYZE while the old DB keeps accepting writes, then hands off to `scripts/neon-cutover.sh`, which only checks HTTP 200 + a `SELECT count(*) FROM users` canary — neither can detect a write that landed on OLD after the dump snapshot and never made it to NEW.
- **Drill**: new `scripts/chaos/neon-cutover-drill.sh` — two local ephemeral Postgres clusters, a continuous background writer against OLD, the *real* `pg_dump`/`pg_restore` invocation and row-count verify `neon-rotate.sh` uses, a stubbed health-gate. Result (reproduced twice): 20 markers written during the ~3.3s window, 5 migrated, **15 silently lost**, verify + health-gate both reported success.
- **Cheap regression check**: `scripts/chaos/check-cutover-has-freeze.sh` greps for a freeze/scale-down step before `pg_dump` and an unfreeze after cutover in `neon-rotate.sh`/`neon-watch.yml` — currently fails on all three checks (correctly documents the gap).
- **Fix path** (already specified in `docs/DB_SCALING_100_PROJECTS.md` §6.1, just never implemented): scale the Railway service to 0 / set a maintenance flag before `pg_dump`, unfreeze only after cutover's health-gate passes.

### 1.2 Possible leaked Neon credential in git history
- **What**: gitleaks' one-off full-history scan (905 commits) found a `generic-api-key` match in `.claude/settings.local.json` at commit `424c7d9` (2026-03-09), value-shaped like a real Neon Postgres password (`npg_...` prefix) — distinct from the 24 other findings, all confirmed test/placeholder fixtures. The file was later untracked and gitignored, so it's absent from the current working tree, but still present in that historical blob.
- **Action needed**: verify whether this credential maps to a still-active Neon project (several rotations have happened since March — it may already be moot) and rotate/revoke if live. History-scrubbing is a separate, destructive decision — not done here.

---

## 2. Security review (whole-codebase adversarial pass)

Reconciliation of the 3 previously-flagged findings (prior internal note, ~70/100):

| Finding | Status | Evidence |
|---|---|---|
| No rate-limit/lockout on 2FA/TOTP brute-force | **MITIGATED** (stale note) | `cmd/auth.go` `Handle2FAVerify` enforces per-IP (10/5min) + per-account (5/5min) limits, one-time-use TOTP counters, audit events on replay/failure. |
| JWT/refresh tokens in frontend `localStorage` | **CONFIRMED OPEN** | `app/frontend/store/auth.ts:24-34` — no `httpOnly` cookie boundary. Any XSS = full, persistent account takeover (refresh token, not just short-lived access token). |
| Single global `MASTER_KEY` root key | **CONFIRMED OPEN** | `crypto/keys.go` derives every user's KEK via `HKDF-SHA256(masterKey, "user_kek:"+userID)`. No versioning/rotation path — compromise = full-system compromise, no way to rotate without re-encrypting the whole DB. |

New findings (both Low):
- `config/config.go` `Config.Save` — `JWTSecret` lacks the `json:"-"` tag that `MasterKey` has, so it's written into local `config.json` (mode 0600, not served over HTTP — low risk, but an inconsistency).
- `cmd/oauth.go` — OAuth state-cookie *clear* sets `HttpOnly` but not `SameSite`/`Secure` (the cookie it clears sets both). Cosmetic; no value is carried.

Checked clean: all 20 `/api/admin/*` routes correctly role-gated per-handler; destructive admin actions require password+TOTP re-auth; share/send tokens are 256-bit random with revocation/expiry/rate-limiting; no path traversal in chunk storage (server-generated UUIDs); no adapter logs/returns raw platform tokens; `telegram_probe.go` only calls a fixed host (no SSRF).

Reference scans: `govulncheck` — 0 exploitable vulnerabilities (backend). `gosec` (via golangci-lint) — 15 findings, all Low/Info, all pre-existing in the accepted baseline (`docs/prepush-baseline.env`), no new issues.

---

## 3. Secret scanning (gitleaks, newly wired)

- `.gitleaks.toml` (new) + `.gitleaksignore` (new, fingerprint-based, no secret values embedded) covering 24 confirmed placeholder/fixture findings.
- Advisory-only diff-scoped step added to `scripts/prepush.sh`'s INSPECT tier.
- New `gitleaks` job in `.github/workflows/security.yml` (full-repo, same schedule as `govulncheck`, `continue-on-error: true`).
- The one real flagged finding is §1.2 above.

---

## 4. Docker load-testing environment (built, verified, not yet load-run at scale)

- New gated `MockAdapter` (`app/backend/adapters/mock.go`) — disk-backed, only reachable via `createAdapter`/`HandleConnectPlatform` when `ZCRYPT_ENABLE_MOCK_ADAPTER=true` (unset in real prod → rejected exactly as today).
- `docker-compose.loadtest.yml` (new): Postgres + backend (existing Dockerfile, unmodified) + optional frontend (profile `full`) + seed script + k6 runner — never touches real Neon or real GitHub/GitLab/HF/Telegram credentials.
- New `Makefile` targets: `loadtest-docker-{up,seed,smoke,auth,upload,safe,down,reset}`. `stress`/`soak` intentionally excluded from the `safe` composite.
- Verified via `go build`/`go vet`/`gofmt` (clean) and `docker compose config` (valid) — **not yet actually run at load** (containers weren't started this session; see Roadmap §6).
- `tests/load/k6/stress.js` bumped from a 300 VU ceiling to a staged ramp up to **1,000 VUs**; `soak.js` bumped from 20 to **100 sustained VUs** — both comfortably exceed a 500-1k-hourly-user bar with margin, and stress.js now actually hunts for the breaking point rather than stopping short of it.

---

## 5. Integration + chaos testing (`app/backend/integration/`) — COMPLETE

Extended the existing build-tagged integration harness (`mock_adapter_test.go`: upload fault injection — transient-then-recover, permanent, `CreateRepo` failure, gated/blocking for concurrency tests, real ciphertext byte storage; new `mockDirectAdapter` and `mockBatchAdapter` fakes for the presign and batch-commit paths). Added 12 new/extended tests across 5 new files (`roundtrip_test.go`, `heal_dead_repo_test.go`, `commit_verify_test.go`, `reppool_threshold_test.go`, `chaos_test.go`) covering the full scenario list from the plan (ciphertext round-trip via download+verify, `healDeadRepo` happy path, relay-mode-has-no-self-heal, phantom-commit regression, non-batch trust boundary, inter-session-only threshold rotation, concurrent-`GetOrCreateRepo` safety, reconcile-across-two-repos, transient/permanent adapter failure, `CreateRepo` failure, cancel-during-in-flight-upload).

**Verified**: `go build`/`go vet`/`gofmt` clean; full suite run against a fresh ephemeral Postgres — **all 12 new/extended tests pass**, no regressions in existing tests.

**Real findings surfaced:**
1. Confirmed (not a new bug, locked in as current behavior): relay-mode uploads (GitHub/GitLab/Telegram + the sync worker) have no self-heal for a vanished repo — only the presign (HuggingFace) path recovers. Matches §6 item 5 above.
2. **New finding, same shape as the historical HF bug, broader scope**: `HandleUploadComplete`/`HandleUploadStatus` report success/100% based solely on which chunks were *staged*, with no signal that a chunk ever actually reached the platform. `TestSyncSurfacesPermanentAdapterFailureAsStuck` proves a fully-failed upload (0 bytes durable anywhere) still reports full completion and a 200 on `/complete`. This affects every adapter not covered by `commitAndVerify` (i.e., everything except HuggingFace) — folds into and sharpens roadmap item 6 below: it's not just "no re-verification," it's "the client-visible status is actively wrong."
3. Confirmed: `reppool.Manager.GetOrCreateRepo` is not transactional — concurrent calls at the threshold boundary observably (2/8 runs) left more than one simultaneously-active repo. No data corruption, but no schema constraint prevents it.
4. **Unrelated pre-existing bug, found incidentally**: `integration/upload_cap_test.go`'s "exactly at the cap is not size-rejected" subtest now fails on current `main` — the already-merged shared-storage 1 GiB cap (`b3e979f`) means the test's token-less user always hits "shared storage is full" (413) before the per-file-cap logic it's isolating ever runs. Not touched (out of scope for this pass) — needs its own fix.

---

## 6a. Hardening work completed this pass

### Item 1: Neon rotation write-freeze — DONE, verified end-to-end
- `app/backend/cmd/maintenance.go` (new): `atomic.Bool` maintenance flag on `Server`, `POST /api/internal/maintenance` toggle (static-secret auth via `X-Maintenance-Secret`, constant-time compare, disabled by default when `MAINTENANCE_SECRET` is unset), and `MaintenanceGate` — a top-level `main.go` wrapper that 503s every non-GET/HEAD/OPTIONS request while frozen (reads keep working; health check and the toggle endpoint itself are exempt).
- `scripts/neon-rotate.sh`: calls the toggle before `pg_dump`, releases it explicitly after cutover AND via an `EXIT` trap (so a crash can't leave production stuck frozen). Falls back to the old unprotected behavior with a loud alert if `MAINTENANCE_SECRET`/`BACKEND_URL` aren't configured, rather than failing silently.
- `.github/workflows/neon-watch.yml`: passes `MAINTENANCE_SECRET` through (new GitHub Actions secret needed — not yet set, see Ops below).
- 5 new unit tests (`cmd/maintenance_test.go`) — all pass. Full backend suite still green, no regressions.
- **Verified the fix actually closes the gap**: extended `scripts/chaos/neon-cutover-drill.sh` with a `WITH_FREEZE=1` mode that simulates the same freeze window. Baseline (no freeze): 14/19 markers lost. With the freeze simulated: **0/5 lost**. `scripts/chaos/check-cutover-has-freeze.sh` now passes (was failing by design before the fix).
- `docs/DB_SCALING_100_PROJECTS.md` §6.1/§6.3 and the V-2 risk register row updated to describe the implemented mechanism.
- **Remaining ops step (not done — needs you)**: generate a `MAINTENANCE_SECRET` value, set it as a GitHub Actions secret AND as a Railway env var on the backend service (must match exactly), matching how `HEALTH_URL`/`RAILWAY_TOKEN` etc. are already configured. Until that's set, rotation runs exactly as before (unprotected, loudly alerted) — this is a deliberate fail-open-with-noise choice, not a silent gap.
- Also fixed in passing: reverted an initial attempt to strip `JWTSecret` from `config.json`'s JSON serialization (roadmap item 7) — turned out `config.Load()` depends on that persistence to keep an auto-generated JWT secret stable across restarts when no `ZCRYPT_JWT_SECRET` env var is set; removing it would silently invalidate every session on every restart in that mode. Left as-is; the original finding's severity (Low, local 0600 file, never served over HTTP) didn't justify that regression.

### Item 2: Leaked credential — investigated, looks stale but needs your final confirmation
Traced the flagged commit (`424c7d9`, 2026-03-09): it added a Bash-permission-allowlist entry to `.claude/settings.local.json` containing a live-looking Neon connection string — role `neondb_owner`, password `npg_4IRt...` (redacted here), host `ep-soft-sunset-aioquetx-pooler...neon.tech`. That hostname matches project `royal-mud-98972458` — the project that was your **active production DB right up until today's rotation**, and which the rotation kept as the **standby/rollback anchor** (not deleted).

Good sign: the password currently configured in `app/backend/.env` for that same host is **different** from the leaked one — consistent with the role's password having been reset at some point since March, which would have invalidated the old one. I don't have Neon API/console access to confirm this with certainty. **Please verify directly** (Neon console → `royal-mud-98972458` → check the password-reset history on `neondb_owner`, or just try the old connection string and confirm it's rejected) and rotate it if there's any doubt — this project still holds a real, recent snapshot of your data and stays around as a rotation target.

### Item 3: Refresh-token storage — DONE, scoped to the actual risk
Research first (surprising, load-bearing findings): the web SPA is genuinely cross-origin (calls `NEXT_PUBLIC_API_URL` directly, bypassing an existing same-origin `/api/*` rewrite that only the Tauri/native path uses), no `Access-Control-Allow-Credentials` existed anywhere, no frontend fetch used `credentials: 'include'`, and — critically — **desktop (Tauri) forwards the raw refresh token into its Rust sync worker**, so a pure httpOnly-cookie-only redesign would have silently broken desktop background sync. Scoped the fix to match the actual finding ("any XSS = full, *persistent* takeover" — the persistence is what's fixed, not token delivery in general):

- Backend (`cmd/auth.go`, `cmd/oauth.go`): every token-issuing path (`issueTokens`, `issueDecoyTokens`, the OAuth web-redirect branch) now **additionally** sets `zcrypt_rt` — httpOnly, `Secure`, `SameSite=None` (required since the app is genuinely cross-origin), scoped to `Path=/api/auth` only. This is additive: the JSON body still includes `refresh_token` too, since desktop still needs the raw value.
- `HandleRefreshToken`/`HandleLogout` now read the refresh token from the cookie first, falling back to the JSON body (`extractRefreshToken`) — so desktop keeps working unchanged, and logout always clears the cookie server-side.
- `main.go` CORS: added `Access-Control-Allow-Credentials: true`, paired with the existing non-wildcard origin-reflection (already safe).
- Frontend (`store/auth.ts`): the refresh token is only ever written to `localStorage` when running under Tauri (`isTauri` check) — on the web it lives in memory only for the current tab's lifetime. This is the actual fix: an XSS payload can no longer read a persistent refresh token out of `localStorage` on the web app, closing the "full, persistent account takeover" finding. Access token storage is unchanged (accepted lower risk, per the original finding's own framing).
- `auth-fetch.ts`, `auth-guard.tsx`, `guest-guard.tsx`: the various "do we have a refresh token" gates now distinguish desktop (still requires an actual in-memory value) from web (always attempts the refresh call, relying on the cookie) — otherwise web sessions would silently log out on every reload past the access-token lifetime.
- `avatar-dropdown.tsx`, `mobile-nav.tsx`: logout now always calls the API (previously skipped the call entirely when `refreshTokenValue` was falsy, which — combined with the above — would have left the httpOnly cookie never revoked server-side on some web logouts).
- Added 5 new backend unit tests (cookie attributes, cookie-over-body precedence, empty-token handling) and updated/added 4 frontend tests to encode the new intentional web-vs-desktop contract, replacing 3 tests that encoded the old (now-wrong) behavior. Full backend suite (all packages) and full frontend suite (104 files / 1800 tests) both green.
- **Not done / deliberately out of scope**: CSRF hardening beyond `SameSite=None`+`Secure`. Assessed as low-value here — refresh/logout have no observable side effect useful to a cross-site attacker (the new access token goes to the victim's own browser, not the attacker), so a full CSRF token scheme wasn't added. Also not done: reuse-detection on refresh-token rotation (a stolen-then-rotated token just 401s on replay today, with no session-family revocation) — noted as a real gap by the research but out of this pass's scope.

### Item 4: MASTER_KEY rotation — correction to the security review, then hardened
**Correction**: the security review's "no versioning/rotation support" finding was checking `cmd/tokenversion.go` (JWT revocation, unrelated) and missed `app/backend/tools/reseal/main.go` — a real, already-working offline rotation tool: re-encrypts both at-rest surfaces (`platform_tokens.token_encrypted`/`token_nonce`, `users.totp_secret`) under a new `MASTER_KEY` inside one atomic transaction, with dry-run mode and idempotent re-run safety (a row already migrated by an interrupted prior run is detected and skipped). The real gaps were: **zero test coverage**, **no documented runbook**, and **the same write-freeze race the Neon rotation had** — a platform-token connect or TOTP-enable by the live app between the tool's `SELECT` and its `UPDATE` would be encrypted under OLD by the still-running app and never caught.

Fixed:
- `tools/reseal/main.go`: now integrates with the exact same write-freeze primitive built for item 1 (`cmd/maintenance.go`) — calls `POST /api/internal/maintenance` before `-apply` starts and releases it via `defer`, success or failure. Same fail-open-with-noise philosophy as `neon-rotate.sh` (proceeds with a loud warning if `BACKEND_URL`/`MAINTENANCE_SECRET` aren't set, rather than a hard refusal — key rotation is sometimes an emergency leak response where speed matters).
- New `tools/reseal/main_test.go` (previously nonexistent): a real end-to-end test against a live ephemeral Postgres — seeds a platform token and a TOTP secret encrypted under an "old" key, runs the actual `resealPlatformTokens`/`resealTOTPSecrets` functions the CLI uses, confirms both now decrypt under the "new" key and no longer under the old one, and confirms a second run is a correct no-op (idempotency). Both new tests pass; full backend suite (including this new package) stays green.
- New `docs/MASTER_KEY_ROTATION.md`: the runbook that didn't exist — when to rotate, the exact command sequence (dry run → freeze → apply → update env → redeploy → verify → retire the old key), and explicitly scopes what it does and doesn't cover (e.g. historical backups still hold data under the old key).

## 6. Roadmap to a hardened, "best-in-class" system

Ranked by severity/leverage, not effort. Items 1-4 (the original top priorities) and part of item 7 are now **DONE** — see §6a above for what was built and verified.

1. ~~**[Critical, live] Implement the Neon rotation write-freeze**~~ — **DONE** (§6a). Verified via the chaos drill: 0/5 lost with the freeze vs. 14/19 without.
2. ~~**[Critical] Resolve the possible leaked Neon credential**~~ — **INVESTIGATED** (§6a): traced to the pre-rotation production project, current `.env` password differs from the leaked one (likely already rotated) — **you still need to confirm directly via the Neon console**, I couldn't verify liveness myself.
3. ~~**[High] Move JWT/refresh tokens out of `localStorage`**~~ — **DONE** (§6a), scoped to the refresh token specifically (the "persistent" part of the risk) with the desktop/Tauri constraint preserved.
4. ~~**[High] Add `MASTER_KEY` versioning/rotation**~~ — **DONE** (§6a): turned out a rotation tool already existed (`tools/reseal/`) but was untested, undocumented, and had the same write-freeze race as the Neon rotation — all three fixed.
5. **[Medium] Decide on relay-mode/byos-direct self-heal** — today only the presign (HuggingFace) path recovers from a dead repo mid-session; GitHub/GitLab/Telegram relay uploads and byos-direct don't. Either wire in the same recovery or explicitly document the asymmetry as accepted risk. *(Not started this pass.)*
6. **[High — sharpened by §5 finding 2] Extend post-write verification beyond HuggingFace.** This is worse than "no re-verification": `HandleUploadComplete`/`HandleUploadStatus` actively report full success on a completely-failed upload (0 bytes durable anywhere) for any non-`BatchCommitter` adapter (GitHub/GitLab/Telegram — i.e. most of them). Users can be told "done" on data that doesn't exist, and it's currently undetectable outside a full reconcile sweep. Promoted from Medium given the proof-of-concept test (`TestSyncSurfacesPermanentAdapterFailureAsStuck`). *(Not started this pass — the next highest-leverage item.)*
7. **Two small security findings**: OAuth state-cookie clear missing `SameSite`/`Secure` — **DONE** (now matches the cookie it clears). `JWTSecret` missing `json:"-"` — **investigated and deliberately NOT changed**: `config.Load()` depends on `JWTSecret` round-tripping through `config.json` to keep an auto-generated secret stable across restarts when no `ZCRYPT_JWT_SECRET` env var is set; stripping it would silently invalidate every session on every restart in that mode. The original finding's severity (Low, local 0600 file, never served over HTTP) didn't justify that regression.
8. **[Low] Fix e2e/UI drift** — `tests/e2e/helpers.ts`'s `registerUser` fills `input[name="email"]`, but the current `/register` page has no email field at all (username/password/confirmPassword only). Decide which side is wrong (product or test) and fix accordingly. *(Not started.)*
9. **[Ops] Actually run the Docker load-test stack at scale** — infra is built and validated statically but the 1,000-VU stress run and 100-VU soak run haven't been executed yet; run them to get real capacity numbers (current bottleneck, actual safe concurrent-user ceiling) rather than assumed ones. *(Not started.)*
10. **[Ops] Promote gosec/gitleaks from advisory to blocking** once a clean baseline holds for a couple of cycles, following the repo's existing ratchet pattern (`docs/prepush-baseline.env`). *(Not started.)*
11. **[Low, unrelated] Fix `integration/upload_cap_test.go`** — its "exactly at cap" subtest now false-fails against current `main` because the shared-storage 1 GiB cap (`b3e979f`) trips before the per-file-cap logic it's testing ever runs. Pre-existing, found incidentally. *(Not started.)*

**Remaining highest-leverage item: #6** (upload status lying about success on non-HuggingFace platforms) — a real, proven data-integrity gap with the same shape as the historical bug this whole testing pass was partly motivated by.

### Ops follow-ups needed from you (not code — deployment/config)
- Generate and set `MAINTENANCE_SECRET` + confirm `BACKEND_URL` on both Railway (backend) and GitHub Actions secrets (used by both `neon-watch.yml` and, optionally, wherever you run `tools/reseal` from).
- Confirm the leaked-credential finding (§6a item 2) directly against the Neon console.
