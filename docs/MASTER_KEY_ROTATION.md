# zcrypt: MASTER_KEY Rotation Runbook

## Why this document exists

A security review (2026-09-24) flagged `MASTER_KEY` as a single-point-of-compromise: it's
the root key material every user's platform-token and TOTP-secret encryption is derived
from (`crypto.DeriveUserKEK`), and there was no *documented* way to rotate it. The
rotation mechanism itself already existed (`app/backend/tools/reseal/`, written earlier)
but was undocumented, untested, and — critically — had no write-freeze around it, meaning
a platform-token connect or TOTP-enable by the live app mid-rotation could be silently
missed (the exact same race class as the Neon DB rotation, see
`docs/DB_SCALING_100_PROJECTS.md` §6.1). Fixed 2026-09-24: the tool now integrates with
the same write-freeze primitive (`cmd/maintenance.go`) built for the Neon rotation, and
has real test coverage (`tools/reseal/main_test.go`, run against a real Postgres).

## What gets rotated

Two at-rest surfaces are keyed by `DeriveUserKEK(MASTER_KEY, userID)`:
- `platform_tokens.token_encrypted` / `token_nonce` (raw AES-256-GCM bytes)
- `users.totp_secret` (an `"enc:v1:"`-prefixed sealed string)

Everything else — file/chunk encryption, TOTP verification codes, JWTs — is either
client-side (zero-knowledge: the server never has the keys) or keyed by
`ZCRYPT_JWT_SECRET`, a separate secret with its own rotation story (JWT revocation via
`token_version`, not covered by this doc).

## When to rotate

- **Suspected/confirmed leak** of the current `MASTER_KEY` (e.g. found in a log, a
  committed file, an exposed env dump). Treat as an incident: rotate immediately.
- **Routine hygiene**, if/when the team adopts a rotation cadence. No cadence is
  currently mandated.

## Procedure

1. **Generate the new key**: `openssl rand -hex 32`. Never reuse a key that's ever been
   the current or a previous `MASTER_KEY`.
2. **Set the freeze env vars** (one-time setup, then reused every rotation):
   `BACKEND_URL` (the API's public base URL) and `MAINTENANCE_SECRET` (a fresh shared
   secret — `openssl rand -hex 32` again) on both the **backend's** environment (Railway)
   and wherever you'll run the reseal tool from. These must match exactly; see
   `cmd/maintenance.go`.
3. **Dry run first, always**:
   ```bash
   export DATABASE_URL='<production DB URL>'
   export MASTER_KEY_OLD='<current key>'
   export MASTER_KEY_NEW='<freshly generated key>'
   go run ./tools/reseal
   ```
   Reports what *would* change, writes nothing. Confirm the counts look sane (roughly
   matches your known user/token count) before proceeding.
4. **Apply, with the write-freeze**:
   ```bash
   export BACKEND_URL='https://api.zcrypt.cloud'      # match your real backend URL
   export MAINTENANCE_SECRET='<the shared secret from step 2>'
   go run ./tools/reseal -apply
   ```
   This freezes writes (`POST /api/internal/maintenance {"enabled":true}`), re-encrypts
   every row inside one transaction, commits, and releases the freeze — success or
   failure (deferred, mirrors `scripts/neon-rotate.sh`'s `EXIT` trap pattern). If
   `BACKEND_URL`/`MAINTENANCE_SECRET` aren't set, it proceeds anyway with a loud warning
   (fail-open-with-noise, not a hard refusal — matches the Neon rotation's philosophy:
   sometimes speed matters more than a perfect freeze, e.g. responding to an active
   leak).
5. **Update `MASTER_KEY` and redeploy**: set `MASTER_KEY=<new key>` on Railway, redeploy
   the backend. Until this step, the running app is still using the OLD key — the
   freeze in step 4 protects the *database* from missed writes, but the app itself keeps
   serving with the old key until it restarts with the new one.
6. **Verify**: confirm a platform-token-gated action (e.g. viewing connected platforms)
   and 2FA login still work post-redeploy.
7. **Retire the old key**: once verified, the old `MASTER_KEY` value should be discarded
   everywhere it was stored (password manager, old `.env` backups, etc.) — after this
   point nothing should ever need it again, since every row was re-encrypted in step 4.

## Safety properties

- **Idempotent**: re-running `-apply` against already-migrated rows detects and skips
  them (tries decrypting under NEW first) rather than double-encrypting or erroring —
  safe to retry after an interrupted run. Verified in `tools/reseal/main_test.go`.
- **Atomic**: all rows are re-encrypted inside a single DB transaction; a failure midway
  rolls back everything, leaving the database exactly as it was under the old key.
- **Write-freeze**: closes the race between the tool's `SELECT` and the live app's
  concurrent writes under the old key (see "Why this document exists" above).

## What this does NOT cover

- **Historical backups**: any DB backup/snapshot taken before rotation still contains
  data encrypted under the OLD key. If the OLD key is confirmed leaked, treat old
  backups as compromised too (or re-encrypt them separately) — this tool only touches
  the live database.
- **Reuse-detection / audit trail of who used the leaked key**: out of scope here.
- **Automatic/scheduled rotation**: this is a deliberate, manual, operator-run process,
  not a scheduled job (unlike the Neon DB rotation carousel).
