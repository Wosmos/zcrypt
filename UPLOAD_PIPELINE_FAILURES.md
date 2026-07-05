# zcrypt — Upload / Download Pipeline Failure Report

**Date:** 2026-07-06
**Context:** Production testing. Uploading `DaVinci_Resolve_21.0_Mac2*.zip` (3.4 GB each), **multiple copies concurrently**, platform = **Telegram**. Reporter's connection: fast.com shows **82 Mbps** (note: that's *download*).

> **Severity: SHIP-BLOCKER.** In one test session a 3.4 GB upload ran for **~18 minutes**, reached **100%**, and **still failed** ("not all chunks have been uploaded") — and the app logged the user out. Large-file transfer is the product's core promise; an 18-minute wait that ends in failure + logout is a one-and-done churn event. Treat P0 items below as release-gating.

> ## ✅ STATUS 2026-07-06 — fixes applied & verified (all prepush gates green, 1178 FE tests pass). NOT yet pushed/deployed.
> **Root-cause CORRECTION:** the crash is **NOT** the OOM double-buffer I noted earlier (that came from the research pass). Verified in code: the chunk row is inserted *before* the client's 200 and never deleted, so OOM/relay/401 cause silent **non-durability that PASSES completion**, not a shortfall. The real cause is **duplicate chunk ROWS** — no `UNIQUE(file_id, idx)` + a racy check-then-insert — counted by *row* instead of *distinct index*.
>
> **Shipped (safe, no DB migration):**
> - **S5 false "not all chunks"** — `GetReceivedChunkIndices` now `SELECT DISTINCT idx` (`index/queries.go:963`) → an over-count can't false-fail completion, and the dangerous *silent-corruption* variant (a duplicate masking a missing index → wrongly "complete") is closed.
> - **S3 >100%** — `incomplete-uploads.tsx:130` clamped with `Math.min(100, …)`.
> - **S4 panel shows in-flight uploads** — panel now cross-references the live upload-store queue and hides anything the dock is still handling; re-fetches on completion.
> - **S7 mid-upload logout** — `auth-fetch.ts` now clears auth **only on a definitive 401/403**; a transient refresh blip keeps the session (upload *already* refreshed the token — the bug was `.catch(() => clearAuth())` firing on any failure). `auth-api.ts` now carries `status` on thrown errors; test updated to the new contract.
>
> **REMAINING — durable fix, needs a PROD DB migration + your go-ahead (shared Neon):** de-dupe existing chunk rows → add `UNIQUE(file_id, idx)` → make `InsertClientChunk` `ON CONFLICT (file_id, idx) DO NOTHING` → stop `uploaded_chunks` double-incrementing. The DISTINCT fix already stops the *visible* failures; this stops duplicate rows being created at all (saves storage + kills the race for good). **NOT run** — a schema change on the shared prod DB is your call.
>
> **S6 resume-download:** its error (`ordered-writer.ts:84`, "incomplete download: wrote X/Y") is downstream of S5 for the already-broken test files (they're genuinely incomplete server-side). Re-test on a *clean* upload before treating it as a separate bug.

This is a triage document. **Nothing here is fixed yet** — it's the map we work from. Each item is tagged:

- ✅ **CONFIRMED** — verified by reading the current source (file:line quoted).
- 🔶 **HYPOTHESIS** — strongly suspected but needs a backend read to confirm (files listed).

---

## 1. Symptoms observed

| # | Symptom | Screenshot evidence |
|---|---------|---------------------|
| S1 | Speed shows `101 undefined/s` and a nonsense ETA `~993540…` | first transfers dock shot |
| S2 | Upload speed stuck at **1–4 MB/s** | dock: `2.1 MB/s`, `4.3 MB/s` |
| S3 | Unfinished-uploads panel shows **>100%** (108% → 127% → 200%) | unfinished panel shots |
| S4 | Unfinished-uploads panel lists uploads **that are still actively uploading in the same tab** | panel + dock both showing the same files |
| S5 | Uploads reach **100%**, then fail: **"not all chunks have been uploaded"** / **"Network request failed"** | transfers "3 failed" shot |
| S6 | **Resume download** fails: **"not all chunks were downloaded"** | reported |
| S7 | App **auto-logs the user out** mid-transfer | reported ("keeps logging user out") |

---

## 2. Root-cause analysis

### ✅ S1 — `undefined/s` is a STALE PROD BUILD, not a code bug
The current source cannot produce `undefined`:

- `components/transfer/transfer-item.tsx:156` → `const speed = \`${formatBytes(entry.rateBps)}/s\`;`
- `lib/utils.ts:13-19` `formatBytes` returns `"<n> <unit>"` where `unit` is only `undefined` above **1 PB/s** (impossible).

So the deployed bundle that produced `101 undefined/s · ~993540…` predates the current speed/ETA rewrite (the "honest upload %" work). **Action:** confirm the prod deploy is on the latest `main`, hard-refresh / bust the cache. If it reappears on a fresh build, reopen this item.

### ✅ S2 / speed — upload is uplink-bound AND double-hopped (by design for Telegram)
Two compounding, non-bug causes:

1. **fast.com's 82 Mbps is DOWNLOAD.** Uploads ride your **uplink**, which on typical home/mobile links is a fraction of download (asymmetric). 1–4 MB/s up is consistent with a ~15–35 Mbps uplink. **Check the real uplink** (fast.com → "Show more info" → upload).
2. **Telegram uses RELAY mode** — `store/upload.ts:702-707` ("RELAY MODE: upload to server (server relays to platform)"). Path is **browser → zcrypt backend → Telegram**: the bytes travel twice and throughput is bounded by the slower leg + backend overhead. HuggingFace uses **DIRECT** mode (`upload.ts:691-701`, presign → PUT straight to HF → confirm), a single hop, so HF is faster by design.
3. **Running 3–4 files at once splits the uplink** across them — each row shows ~2 MB/s because your one uplink is divided.

Per-file chunk concurrency is `maxUploads = useDirectUpload ? 6 : 5` (`upload.ts:632`). So Telegram = 5 concurrent chunk relays per file.

### ✅ S3 — >100% is an **uncapped display** over **bad backend data**
- **Display bug (frontend, confirmed):** `components/upload/incomplete-uploads.tsx:130`
  ```ts
  const pct = u.chunk_count > 0 ? Math.round((u.uploaded_chunks / u.chunk_count) * 100) : 0;
  ```
  No `Math.min(100, …)` → renders 108/127/200%. Trivial display fix.
- **Data bug (backend, 🔶):** `u.uploaded_chunks` is **larger than `u.chunk_count`** (200% = exactly 2×). Strong signal the server counts **cumulative chunk PUTs** (resends from resume/retry included) instead of **distinct chunk indices**. Capping the label hides the symptom but not the cause — the real fix is server-side counting of distinct indices. **Verify:** backend chunk-recording + the `uploaded_chunks` query (see §4).

### ✅ S4 — panel shows in-progress uploads because it never checks the live queue
`incomplete-uploads.tsx:51-58` fetches `getIncompleteUploads()` = the server's **active** upload sessions. An upload that is *currently running in this tab* IS an active server session, so it shows up under "resume or discard." The panel does **not** cross-reference `store/upload.ts`'s live `queue` (non-terminal items). It also only `refresh()`es once on mount (`useEffect` line 60-62), so it's stale after completions too.
**Fix direction:** hide any incomplete-upload whose `(filename, original_size)` matches a non-terminal item in the upload store queue (or match by `session_id` via `itemMeta`), and re-fetch when an upload finishes.

### 🔶 S7 — auto-logout mid-transfer (**CRITICAL — likely the trunk of the tree**)
**Hypothesis (high confidence):** a 3.4 GB relay upload runs 15+ minutes and **outlives the JWT access-token TTL**. Once expired, chunk requests get **401**; the app's auth layer treats that as "session invalid" and **logs out**.

Grounding: the recent commit **`fix(download): refresh token on chunk fetch`** shows token-expiry-mid-transfer was already a known problem and was patched **for downloads** — **uploads likely never got the same refresh.** `withRetry` (`upload.ts:286-309`) treats 401/403 as **non-transient** (not in its transient list) so it throws immediately rather than refreshing.

This one plausibly **causes S5** too: chunks that 401 after expiry never land → `completeUpload` finds them missing → "not all chunks have been uploaded"; and a logout/redirect aborting in-flight requests → "Network request failed."
**Verify/fix:** `lib/upload-session.ts` (uploadChunk/presign/confirm/complete auth header + 401 handling), `lib/api.ts` / auth interceptor (what triggers logout on 401), `store/auth.ts`, backend `auth/` (JWT access TTL + refresh endpoint).

### ✅/🔶 S5 — 100% then "not all chunks have been uploaded" / "Network request failed"
> **UPGRADE (2026-07-06, from the Telegram research pass — now code-confirmed):** the backend buffers each chunk **twice** in RAM — `io.ReadAll(io.LimitReader(r.Body,…))` at `cmd/upload.go:311`, then a full `bytes.Buffer` in `sendDocument` at `adapters/telegram.go:346`. Our own test file warns it: `cmd/download_prod_test.go:335` — *"On Railway's 512MB, concurrent io.ReadAll of 10MB chunks can OOM the backend."* Running 3–4 × 3.4 GB concurrently → OOM → chunks die → `completeUpload` finds gaps. **This is very likely the primary cause.** Fix = **streaming relay** (`io.Pipe`), which also speeds Telegram up. Token-expiry (S7) is the secondary contributor.

The client thinks it's done: byte bar hits 100% and it calls `completeUpload` (`upload.ts:747-761` — it only calls complete when `uploadedChunks === chunkCount`). The **server** rejects it. Candidate causes, in likely order:
1. **Token expiry (S7):** some chunk PUTs 401'd late in the upload; client counted the failures as network blips or the logout aborted them → gaps at complete time. **Strong link to S7.**
2. **Staging durability under concurrent multi-GB load:** relay stages each chunk to `~/.zcrypt/staging` before/independent of the Telegram sync. 3–4 × 3.4 GB ≈ **13.6 GB** of staging on an ephemeral Railway disk under memory/disk pressure → lost staged chunks. (Matches the known "ephemeral staging + failed sync = data loss" risk.)
3. **Chunk-record race:** 5 concurrent PUTs/file × 3–4 files = 15–20 concurrent writes to the same session's chunk set; a non-atomic insert/count could drop a distinct index while double-counting another (also explains S3's 200%).
**Verify/fix:** backend upload complete handler (owns the "not all chunks have been uploaded" string), `pipeline/`, `adapters/telegram` relay, `index/` chunk table + counting.

### 🔶 S6 — resume download "not all chunks were downloaded"
Download-side analogue of S5. **Verify/fix:** `store/download.ts`, `lib/download-session.ts`, backend pull/download handler + the download-session chunk check. Likely shares the token-refresh (S7) and chunk-accounting roots.

---

## 3. Design question — can Telegram / GitHub use the HuggingFace "presigned/direct" trick?

- **HuggingFace works** because HF LFS is **S3-backed** and hands out **presigned PUT URLs** the browser can upload to directly (`upload.ts` direct mode: `presignChunk` → `directUploadToURL` → `confirmChunk`).
- **Telegram — 🔶 NO (needs adapter confirm, but architecturally no):** Telegram uploads require the **bot token** (a server secret) or an MTProto session; there is **no presigned-URL concept** and no browser-friendly CORS upload endpoint. The browser cannot authenticate to Telegram without leaking the bot token. **Relay is mandatory.**
- **GitHub — 🔶 NO (as implemented):** the contents API / git push needs a **PAT** (server secret); no generic presigned upload. (Git **LFS** has a batch API that returns S3 hrefs, but zcrypt stores files as normal repo content, not LFS.)

**Upshot:** presigned/direct is HF-specific. The realistic speed wins for Telegram/GitHub are: (a) **stream** through the backend instead of buffering the full chunk (reduce double-hop latency), (b) co-locate the backend near Telegram's DC, (c) fix S7 so long uploads don't die, (d) don't over-parallelize files on a single uplink.

### ✅ VERIFIED via research pass (2026-07-06): teldrive/caamer20 is a RELAY, not direct
Researched `github.com/caamer20/Telegram-Drive` (a fork of canonical `tgdrive/teldrive`). Confirmed by reading teldrive's code: the browser/rclone client **never talks to Telegram directly** — it POSTs bytes to the teldrive server, which relays. **There is no presigned/direct path anywhere in the Telegram ecosystem** — Telegram's `upload.saveBigFilePart` is an authenticated MTProto RPC, not a signable URL. Browser-direct is only possible by shipping a long-lived, non-revocable, un-scopeable bot/MTProto credential into browser JS (XSS-exfiltratable, can delete the whole channel) — rejected.

**teldrive's speed recipe (relay-but-fast) — the path to copy:**
| teldrive | zcrypt today (code-confirmed) |
|---|---|
| **MTProto** (gotd) → ~2 GB/part, 512 KB parallel sub-parts, 8 threads | **Bot API** → 50 MB/chunk, 20 MB download (split to 19 MB) — `adapters/telegram.go:24-28` |
| **multi-bot pool** (~5), round-robin per chunk (dodge FLOOD_WAIT) | single bot |
| big client chunks (512 MB) × 4 concurrent | 10 MB chunks |
| **streamed** (no buffering) | double-buffered — `cmd/upload.go:311` + `telegram.go:346` |

Note: `adapters/interface.go:40-50` — only HuggingFace implements `DirectUploader`; Telegram is not one, and `cmd/upload.go:703` special-cases telegram for presign but Telegram has no `GetUploadURL`.

**Ranked Telegram speed plan:** (1) **streaming relay** — LOW effort, safest, *also fixes the S5 OOM crash*; (2) **server-side MTProto** (gotd/td) — biggest win, 2 GB parts, creds stay server-side; (3) **multi-bot relay** — near-linear for big files; (4) **self-host Local Bot API server** — cheap, lifts 50 MB→2000 MB + removes 20 MB download cap; (5) ~~GramJS-in-browser~~ — DON'T (only option with a real security downside). *(Exact Telegram constants are single-sourced — verify before building.)*

---

## 4. "Am I testing it wrong?"
No — but **4 copies of the same 3.4 GB file at once (~13.6 GB in flight)** is the *worst case* and amplifies every bug: it splits your uplink (S2), hammers the relay backend's memory/staging (S5), maximizes concurrent chunk races (S3), and makes it near-certain to cross the token-expiry boundary (S7). **Cleanest repro going forward: one 3.4 GB file, single platform, watch the network tab for the first 401.**

---

## 5. Prioritized fix plan

| Prio | Item | Where |
|------|------|-------|
| **P0** | **S7** token refresh on upload (and re-check download) chunk requests; stop 401 → logout during active transfers | `lib/upload-session.ts`, `lib/api.ts`, `store/auth.ts`, backend `auth/` |
| **P0** | **S5** backend chunk accounting + staging durability so a 100% upload can actually complete | backend complete handler, `index/`, `adapters/telegram`, `pipeline/` |
| **P1** | **S3** count distinct chunk indices server-side; cap % at 100 in UI | backend chunk count; `incomplete-uploads.tsx:130` |
| **P1** | **S4** hide actively-uploading sessions from the unfinished panel; refresh on complete | `incomplete-uploads.tsx`, `store/upload.ts` |
| **P1** | **S6** resume-download chunk check | `store/download.ts`, `lib/download-session.ts`, backend pull |
| **P2** | **S1** confirm/redeploy latest build (undefined already fixed in source) | deploy pipeline |
| **P2** | **S2** streaming relay + infra placement; document presigned constraint | backend relay, docs |

**Start here (P0):** diff how DOWNLOAD refreshes its token per chunk vs. how UPLOAD doesn't — that single asymmetry likely explains S7, and through it much of S5.

---

## 6. Files to open first
**Frontend (read):** `store/upload.ts`, `lib/upload-session.ts`, `lib/api.ts`, `store/auth.ts`, `components/upload/incomplete-uploads.tsx`, `store/download.ts`, `lib/download-session.ts`, `components/transfer/transfer-item.tsx`.
**Backend (read — exact filenames TBD on first read; `cmd/push.go` does NOT exist):** the `cmd/` upload handlers (init/chunk/complete/cancel/status), `auth/` (JWT), `index/` (chunk table + `uploaded_chunks` count), `adapters/telegram/`, `pipeline/`.

---

## 7. Open question: what is the MAX file size this system can actually transfer?

This must be answered with a number, not a guess — it gates what we can honestly claim. Right now the ceiling is probably **defined by a time limit, not a size limit**, which is the worst kind:

- **Duration ceiling (from S7):** if the JWT access-token TTL is shorter than the upload wall-time, every file that takes longer than the TTL fails near the end. At the observed ~2 MB/s relay rate, TTL directly maps to a size cap:
  - 15-min TTL ≈ **~1.8 GB** max before it dies
  - 30-min TTL ≈ **~3.6 GB**
  - → 3.4 GB @ 18 min sat right on the edge, which is exactly what we saw. **This is the number to nail down first.**
- **Telegram per-object limits:** bot API vs MTProto have different per-file/per-message ceilings (bot `sendDocument` is ~2 GB/file and ~50 MB via the plain Bot API HTTP upload; MTProto is higher). Since we chunk at 10 MB this is about how the adapter maps chunks → Telegram messages. **Verify in `adapters/telegram`.**
- **Backend staging disk:** ephemeral Railway disk must hold in-flight chunks; concurrent multi-GB uploads can exhaust it (ties to S5). What's the disk budget?
- **Session TTL:** unfinished sessions are kept 7 days — but is the *active* session allowed to live long enough for a slow multi-GB upload?
- **Client memory:** chunking is 10 MB with `pipelineDepth ≤ 12` and `maxUploads = 5`, so client RAM isn't the limit — good.

**Action:** run controlled single-file uploads at 500 MB / 1 GB / 2 GB / 4 GB / 8 GB on Telegram, record pass/fail + wall-time + where it dies, and derive the real ceiling. Publish it as a supported-size figure once P0 fixes land.
