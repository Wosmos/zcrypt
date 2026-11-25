# Moving the website from Vercel to Cloudflare Workers

The web app moves to a Cloudflare Worker. The backend stays on Railway for now. Branch: `feat/cloudflare`.

```
Before:  browser ─► Vercel (Next.js)  ─► /api rewrite ─► Railway (Go)
After:   browser ─► Cloudflare Worker (vinext build of the same app) ─► /api rewrite ─► Railway (Go)
```

## How it is built

- **Same source, two builds.** [vinext](https://github.com/cloudflare/vinext) is Cloudflare's Vite reimplementation of the Next.js API. It builds `app/frontend` into a Worker: `bun run build:vinext`, output in `.cloudflare/output`.
- **`next build` still matters.** It produces the desktop/Android static export (`NEXT_OUTPUT_EXPORT=1`), and CI runs it next to the Worker build.
- **Config files:**
  - `vite.config.ts`: vinext, the React Compiler, and `prerender: true` with the Static Assets cache. Every page, including one `/_` page per dynamic route (`lib/route-shell.ts`), is rendered at build time and served from Workers Static Assets.
  - Why: the free plan allows 10 ms of CPU per request. A render took 20–300 ms; a stored page takes about 6 ms (median, measured on the preview).
  - Dynamic routes: links carry the id in `?id=` (`/spaces/_?id=…`). Share links (`/s/<token>#key`) and older links redirect there; browsers keep the `#key` fragment across the redirect.
  - `cloudflare.config.ts`: the Worker (`zcrypt-web`), the `nodejs_compat` flag, static assets, and the KV binding `VINEXT_KV_CACHE`. No R2 and no Durable Objects, so R2 stays free for file storage.
  - `public/_headers`: headers for static files: the install scripts as text, and immutable `/_next/static`.
- **Kept from `next.config.ts`:** `headers()` (CSP, HSTS and the rest), `rewrites()` (`/api/*` and `/dl/*` to the backend), `pageExtensions` (`.web.tsx` and `.dev.tsx`), and `env`.

## What changed for Workers

| Change | Why |
|---|---|
| `lib/og-brand.tsx` embeds the logo (`lib/og-brand-mark.ts`) | A Worker has no filesystem, and `readFileSync` at module load broke every page. A unit test keeps the copy equal to `public/brand/zcrypt-mark-dark-bg.svg`. |
| Footer year is read during render | A Worker's clock reads 1970 at module load. The server rendered "© 1970", the hydration mismatch wiped user input on `/pad`, and the e2e suite caught it. |
| `proxy.ts` sends `X-Zcrypt-Visitor-IP/Country/Region/City` | Workers don't add Vercel's `X-Vercel-Forwarded-For` or `X-Vercel-IP-*`. The proxy copies Cloudflare's `CF-Connecting-IP` and location headers, only when it runs on Cloudflare. It drops any copy a caller sent itself. |
| Backend reads those headers only next to `X-Zcrypt-Proxy-Secret` | `personIP` (rate limits, cloud-network block) and `visitorLocation` (geo). Vercel's headers still work during the switch. |
| Vercel Analytics → Cloudflare Web Analytics | `components/system/web-analytics.tsx`, with the token in `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`. CSP hosts were swapped. |
| CI deploy job → `vinext-cloudflare deploy` | Runs on pushes to main. `scripts/check-vercel-cost.mjs` is removed (it guarded Vercel's ISR quota). |
| e2e runs against both builds | `Playwright E2E (next)` and `Playwright E2E (worker)`. |
| Privacy policy and docs say Cloudflare | In all 8 languages. Please read the privacy section before cutover (see "Open questions"). |

Verified locally on the Worker build (`vite preview`, workerd):
- every route (pages, OG images, RSS, sitemap, robots, manifest, llms.txt, token pages, 404);
- the `/api` proxy, security headers, sign-in, vault unlock, and an HF download through a direct link;
- the full Playwright suite: 33 passed, 1 skipped on purpose.

## Data baked in at build

`/download` (latest release), the changelog, reviews and download counts are read when the site is built.

- `device.yml` redeploys the website once a release is published.
- `deploy-web.yml` also runs daily at 03:17 UTC.

## What I need from you

1. **Cloudflare account**
   - An API token from the "Edit Cloudflare Workers" template, plus the account ID, saved as GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - For a local deploy, `cf auth login` is enough.
2. **The `zcrypt.cloud` zone on Cloudflare,** if it isn't there yet: point the nameservers to Cloudflare. Then:
   - attach the Worker to `www.zcrypt.cloud` (and the apex redirect) as a Custom Domain;
   - turn on **Rules → Managed Transforms → "Add visitor location headers"**. Without it, the Worker gets the country but not the region and city.
3. **Worker secret:** `ZCRYPT_PROXY_SECRET`, declared in `cloudflare.config.ts` and set as a secret on the Worker and on Railway with the same value. Without it, the backend sees every native-app call as coming from Cloudflare's address: rate limits and the abuse guard collapse onto one IP, and geo is wrong.
4. **GitHub repository variables,** baked into the bundle at build: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` (from Web Analytics → add site).
5. **KV:** the first deploy creates the `VINEXT_KV_CACHE` namespace (free plan: 100k reads and 1k writes a day).
6. **Plan:** free. Pages are prerendered (see above), so a request stays near the 10 ms limit. Watch the CPU time in Workers & Pages → zcrypt-web → Metrics; Workers Logs and Traces are on (`observability` in `cloudflare.config.ts`).

## Cutover, in order

1. Merge `feat/cloudflare` into `staging` and let CI run both e2e targets.
2. Deploy to the `workers.dev` preview: `bun run deploy:vinext -- --preview`. Add that origin to Railway's `ALLOWED_ORIGINS` for the test.
3. Smoke test the preview. Check that the admin console shows real countries for app sign-ins.
4. Attach `www.zcrypt.cloud` to the Worker. DNS switches over in seconds, and Vercel stays up as the rollback.
5. After a quiet week: delete the Vercel project and the `VERCEL_*` secrets, and drop `.vercel` from `.gitignore`.

**Rollback:** point `www.zcrypt.cloud` back at Vercel. The backend accepts both header sets.

## Open questions / follow-ups

- **Privacy policy (s5.l3)** says Cloudflare's country is "not stored". The backend stores sign-up and session location since the admin overhaul. This was already inaccurate on Vercel. Fix the wording before or with the cutover.
- `scripts/railway-flip.sh` repoints `NEXT_PUBLIC_API_URL` with `gh variable set` and redeploys through `deploy-web.yml`, which CI also calls on main and which runs the reindex nudge once the Worker is live.
- vinext gaps that don't affect this app today: no build-time image optimization (images are already unoptimized), fonts load at runtime, and partial `cacheComponents` support (the app doesn't use `"use cache"`).
- The build publishes `.map` files for `/_next/static`. The repo is public, so this is harmless, but it can be turned off.
