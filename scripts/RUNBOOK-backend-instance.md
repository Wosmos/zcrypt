# Runbook — Stand up / rotate a zcrypt backend instance

> **PRIVATE OPS DOC.** Keep this in the private `zcrypt-ops` repo, **not** in public `zcrypt`.
> It contains no secrets, but it maps your infrastructure. Fill placeholders from your
> password manager; never paste real secret values into this file.

This is the repeatable procedure for bringing up a fresh backend (new Railway service +
new Neon DB) behind the stable Cloudflare domain. Follow the phases **in order** — later
phases depend on earlier ones.

---

## 0. Generate & save secrets (do this FIRST, offline)

```bash
openssl rand -hex 32   # -> MASTER_KEY
openssl rand -hex 32   # -> ZCRYPT_JWT_SECRET
```

- Save **both** in your password manager immediately. These are permanent.
- **Never reuse** the secrets that leaked in public git history (`MASTER_KEY 45ce72…`,
  `ZPUSH_JWT_SECRET b6d5fd…`). They are burned.
- On a **fresh empty DB** there is nothing sealed, so this is a *set*, not a *rotation* —
  no reseal needed. (Reseal is only for recovery day; see §8.)

---

## 1. Database (Neon)

1. Create a new Neon project. Region: match Railway's region for low latency.
2. Copy the **pooled** connection string → this is `DATABASE_URL`
   (the `...-pooler...` host; the app's pgxpool is tuned for PgBouncer).
3. Note the **project id** → `NEON_PROJECT_ID` (needed by the watcher).
4. Neon console → Account settings → API keys → create one → `NEON_API_KEY`.

---

## 2. Backend (Railway)

1. Create a service from this repo's root `Dockerfile` (distroless Go build).
2. Set environment variables (see the **matrix** in §9). At minimum:
   `DATABASE_URL`, `MASTER_KEY`, `ZCRYPT_JWT_SECRET`, `FRONTEND_URL`, `ALLOWED_ORIGINS`.
   Leave `BACKEND_URL` for §3 (needs the domain first).
3. Deploy. The schema **auto-migrates on boot** (`runMigrations`); to pre-apply it
   manually run the `migrate` subcommand (`zcrypt-server migrate`).
4. Set Railway's health check path to **`/api/health`** (returns `{"status":"ok"}`, no DB touch).
5. Verify: `curl https://<railway-domain>/api/health` → `{"status":"ok"}`.

---

## 3. Stable domain (Cloudflare)

1. In **Railway**: add the custom domain `api.zcrypt.cloud` → Railway gives you a CNAME target.
2. In **Cloudflare** DNS: `CNAME  api  ->  <railway target>`.
3. **Cloudflare SSL/TLS mode = Full (strict).** ⚠️ "Flexible" causes infinite redirect
   loops with Railway. This is the #1 footgun.
4. Back in **Railway** env: set `BACKEND_URL=https://api.zcrypt.cloud` → redeploy.
5. Set `ZCRYPT_TRUSTED_PROXY_COUNT` to the number of proxy hops in front of the app.
   ⚠️ With Cloudflare proxying (orange cloud) **+** Railway's edge, this is usually `1`–`2`.
   **Verify empirically:** hit an endpoint, check the logged client IP is *your* IP, not a
   Cloudflare/Railway IP. If it's wrong, the auth rate limiter buckets everyone together
   (or becomes spoofable) — bump/lower the count until the logged IP is correct.

> **Why the stable domain matters:** clients and OAuth only ever know `api.zcrypt.cloud`.
> To move hosts later, you change **one CNAME** — no client, OAuth, or code changes.

---

## 4. OAuth redirect URIs (only if you use OAuth login)

Register these **exact** URIs with each provider (must match `BACKEND_URL` exactly):

- Google → `https://api.zcrypt.cloud/api/auth/oauth/google/callback`
- GitHub → `https://api.zcrypt.cloud/api/auth/oauth/github/callback`

Set `GOOGLE_CLIENT_ID/SECRET` and/or `GITHUB_CLIENT_ID/SECRET` in Railway. OAuth for a
provider is **silently disabled** unless both its ID and secret are set. The backend logs
the exact URIs at startup and serves them at `GET /api/auth/oauth/config`.

---

## 5. Frontend (Vercel)

- Set `NEXT_PUBLIC_API_URL=https://api.zcrypt.cloud`.
- ⚠️ `NEXT_PUBLIC_*` is **baked at build time** — you must **rebuild / redeploy** Vercel,
  not just change the env var. A stale build will keep pointing at the old backend.

---

## 6. Quota watcher (GitHub Actions — `.github/workflows/neon-watch.yml`)

Add these **repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| ------ | ----- |
| `NEON_API_KEY` | from §1.4 |
| `NEON_PROJECT_ID` | from §1.3 |
| `NTFY_TOPIC` | your ntfy.sh topic (pick an **unguessable** name — topics are public by name) |

The workflow runs every 6h + on manual dispatch, and pings ntfy at 60% / 80% CU-hour usage.
Trigger it once manually to confirm it authenticates and reports.

---

## 7. Claim admin + verify end-to-end

1. **Register your own account FIRST.** ⚠️ The first user to register on a fresh DB is
   auto-promoted to **admin** (SQL CASE in `CreateUser`). Do this before the instance is
   reachable by anyone else, or a stranger becomes your admin.
2. Smoke test: create a vault, upload a file, download it (passphrase round-trip),
   move to trash + restore. Confirm SSE progress works.
3. If email is configured, test the verification / reset flow.
4. If OAuth is configured, test one provider end-to-end.

---

## 8. Recovery day — when the OLD locked DB (DB-A) comes back

The real production DB recovers at the monthly Neon reset. Its data is sealed under the
**burned** `MASTER_KEY (45ce72…)` and its connection string leaked. To bring it back safely:

1. **Clone it off the leaked/exhausted project:** run `neon-rotate.sh` with
   `OLD_DATABASE_URL=<recovered DB-A direct url>` → it pg_dumps into a fresh Neon project
   and verifies row counts. This escapes both the leaked password and the spent quota.
2. **(Optional but recommended) reseal the MASTER_KEY** off the burned value:
   ```bash
   DATABASE_URL='<new clean project>' \
   MASTER_KEY_OLD='45ce72…'  MASTER_KEY_NEW='<the current MASTER_KEY>' \
     go run ./tools/reseal          # dry run
     go run ./tools/reseal -apply   # rewraps platform tokens + TOTP under the new key
   ```
3. Repoint Railway `DATABASE_URL` at the clean project → redeploy → §7 smoke test.
4. Keep DB-A ≥7 days as a rollback anchor; its quota refills next month for reuse.

---

## 9. Environment variable matrix (source of truth)

Verified against `app/backend/config/config.go` + `app/backend/main.go`.

### Required
| Var | Notes |
| --- | ----- |
| `DATABASE_URL` | Neon **pooled** URL |
| `MASTER_KEY` | 32-byte hex; seals platform tokens + TOTP at rest |
| `ZCRYPT_JWT_SECRET` | ≥32 chars. If empty it auto-generates and **won't persist** on Railway → everyone logged out each deploy. Always set explicitly. (Legacy alias: `zcrypt_JWT_SECRET`.) |
| `FRONTEND_URL` | email links + post-OAuth redirect; auto-added to CORS |
| `ALLOWED_ORIGINS` | comma-separated CORS allow-list; Vercel domain + Tauri origins |

### Domain / proxy
| Var | Notes |
| --- | ----- |
| `BACKEND_URL` | `https://api.zcrypt.cloud`, no trailing slash. Required for OAuth. |
| `ZCRYPT_TRUSTED_PROXY_COUNT` | proxy hops for X-Forwarded-For (Cloudflare+Railway ≈ 1–2; verify) |

### Optional
| Var | Notes |
| --- | ----- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (both required to enable) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth (both required to enable) |
| `RESEND_API_KEY` / `RESEND_FROM` | email (verification/reset). Without these, email is disabled. |
| `ZCRYPT_PORT` | port override (else `PORT`, else 8080) |
| `ZCRYPT_CHUNK_CACHE_MB` | relay chunk cache size tuning |
| `DEV_MODE` | `true` disables ALL rate limiting — **never** in prod |

---

## 10. One-time hygiene (independent of any instance)

- [ ] Revoke the leaked Gmail SMTP app password (`cjqk eekd jjvu todi`) in Google Account → App passwords.
- [ ] Add `.claude/settings.json` to `.gitignore` (that's where secrets kept leaking into history).
- [ ] Keep ops tooling (`neon-*.sh`, `neon-watch.yml`, this runbook, `DB_SCALING_100_PROJECTS.md`) in the **private** repo, off public `main`.
- [ ] Set up scheduled `pg_dump` backups of the live DB (no backup story exists yet).
