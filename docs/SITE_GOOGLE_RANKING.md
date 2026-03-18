# zcrypt.cloud — Full Audit, Issues & Execution Plan

> Brutally honest assessment. No sugarcoating.
> Date: March 18, 2026

---

## PART 1: CRITICAL ISSUES

### 1. Domain & Brand — CATASTROPHIC

| Issue | Severity | Detail |
|-------|----------|--------|
| Ransomware name collision | 🔴 Critical | "zcrypt" / "ZCryptor" is a well-documented ransomware (2016) covered by Microsoft, McAfee, Malwarebytes, Check Point, Bitdefender, Kaspersky. Every Google search for "zcrypt" returns malware warnings. |
| Zero brand trust signal | 🔴 Critical | Your target market is privacy-conscious users. They WILL Google your name before trusting you with files. They will see ransomware results and leave. |
| `.cloud` TLD weakness | 🟡 Medium | `.cloud` has lower trust and SEO weight than `.com` or `.io`. Users are less likely to remember or type it correctly. |
| Competing GitHub projects | 🟡 Medium | At least 3 open-source projects named "zCrypt" on GitHub (encryption tools). Creates brand confusion. |
| IBM `zcrypt` kernel module | 🟡 Medium | IBM's Linux cryptographic device driver is literally called "zcrypt." More search pollution. |

**Verdict:** The domain is a long-term liability. Every marketing dollar spent building "zcrypt" brand awareness partially benefits ransomware awareness instead.

---

### 2. Technical SEO — ZERO VISIBILITY

| Issue | Severity | Detail |
|-------|----------|--------|
| Zero Google indexing | 🔴 Critical | `site:zcrypt.cloud` returns zero results. Google has not indexed a single page. You don't exist on the internet. |
| JavaScript-only rendering | 🔴 Critical | Crawling `zcrypt.cloud` returns only: `"zcrypt — Private Cloud Storage That Costs Less | zcrypt [Skip to content] z"` — the entire site content is behind client-side JS. Google sees a blank page. |
| No `sitemap.xml` detected | 🔴 Critical | No sitemap accessible at standard paths. Google has zero guidance on what to crawl. |
| No `robots.txt` detected | 🟡 Medium | No robots.txt accessible. Missing basic crawler directives. |
| No structured data / schema | 🟡 Medium | No Organization schema, Product schema, or FAQ schema detected. Zero rich snippet eligibility. |
| No meta descriptions visible | 🟡 Medium | Since the HTML is empty (JS-rendered), there are no meta descriptions for Google to use in SERPs. |
| No Open Graph tags visible | 🟡 Medium | Sharing on Twitter/LinkedIn/Discord will show a blank preview. |
| www vs non-www redirect | 🟢 Low | `zcrypt.cloud` redirects to `www.zcrypt.cloud` — fine, but canonical tags need verification. |

**Verdict:** Your site is technically invisible. It's as if it doesn't exist on the internet from a search engine perspective.

---

### 3. Content & SEO Strategy — NONEXISTENT

| Issue | Severity | Detail |
|-------|----------|--------|
| Zero content pages indexed | 🔴 Critical | Even if you have docs, blog, pricing pages — none are indexed because of the JS rendering problem. |
| No blog / content marketing | 🔴 Critical | No educational content targeting keywords like "encrypted cloud storage," "pCloud alternative," "zero knowledge storage." |
| No comparison pages | 🟡 Medium | Missing pages like "zcrypt vs pCloud," "zcrypt vs Tresorit," "zcrypt vs Internxt." These are high-intent keywords. |
| Not listed on privacy directories | 🟡 Medium | Not on PrivacyGuides.org, privacytools.io, AlternativeTo.net — these are where your target audience discovers products. |
| No Product Hunt launch | 🟡 Medium | Missing the single highest-impact launch event for developer/privacy tools. |
| No backlinks | 🔴 Critical | Domain Authority is effectively 0. No external sites link to you. |

---

### 4. Frontend / Crawlability

| Issue | Severity | Detail |
|-------|----------|--------|
| No SSR / SSG | 🔴 Critical | Your Go backend serves an empty HTML shell. All content loads via JavaScript. This is the root cause of every SEO issue. |
| No `<h1>` in initial HTML | 🔴 Critical | The most important on-page SEO element is missing from the server response. |
| No semantic HTML in response | 🔴 Critical | No `<header>`, `<main>`, `<article>`, `<nav>` elements visible in server response. |
| Likely missing alt tags on images | 🟡 Medium | If images exist, they're loaded via JS and likely missing alt attributes for accessibility and SEO. |
| No `<noscript>` fallback | 🟡 Medium | Users with JS disabled (Tor Browser users — your privacy-conscious target audience) see nothing. |

---

### 5. Database & Infrastructure Concerns (from our discussion)

| Issue | Severity | Detail |
|-------|----------|--------|
| Neon free tier limitations | 🟡 Medium | 0.5 GB storage, 100 CU-hours/month, cold starts after 5min idle. Fine for prototyping, not for production with real users. |
| Scale-to-zero cold starts | 🟡 Medium | 400-750ms latency on first request after idle. Bad UX for a storage app where users expect instant file access. |
| No clear scaling path | 🟡 Medium | Multiple free Neon DBs is not a scaling strategy. Need to plan for $19-25/month paid tier when user base grows. |

---

## PART 2: EXECUTION PLAN

### Phase 1 — Immediate (Week 1-2): Fix Foundations

**Priority: Make the site exist on the internet.**

- [ ] **Implement SSR or pre-rendering**
  - If using React → migrate to Next.js with SSR/SSG
  - If using Svelte → use SvelteKit with SSR
  - If using Vue → use Nuxt with SSR
  - Alternative: Have your Go backend serve pre-rendered HTML for all marketing/docs pages, use JS only for the app dashboard
  - At minimum: Pre-render the landing page, docs, pricing, and about pages as static HTML
- [ ] **Create and submit `sitemap.xml`**
  - List all public pages: `/`, `/docs`, `/pricing`, `/about`, `/blog`
  - Submit to Google Search Console
- [ ] **Create `robots.txt`**
  - Allow all crawlers to index public pages
  - Disallow `/app/`, `/dashboard/`, `/api/` (private routes)
- [ ] **Add meta tags to every page**
  - Unique `<title>` and `<meta name="description">` per page
  - Open Graph tags (`og:title`, `og:description`, `og:image`)
  - Twitter Card tags
- [ ] **Add structured data**
  - Organization schema on homepage
  - Product schema on pricing page
  - FAQ schema on docs/FAQ page
- [ ] **Verify domain in Google Search Console**
  - Request manual indexing of homepage
  - Monitor coverage report for errors
- [ ] **Add `<noscript>` fallback content**
  - Critical for Tor Browser users (your target audience)

### Phase 2 — Short Term (Week 3-4): Content & Rebrand

- [ ] **Decide on domain change** (strongly recommended)
  - Research and purchase new `.com` domain (suggestions: bytefort.com, storveil.com, enclova.com)
  - Buy from Porkbun (~$11/year, flat renewal)
  - Set up 301 redirects from old domain to new
  - Update all references
- [ ] **Create core content pages**
  - Landing page with clear value proposition
  - Features page detailing encryption, pricing advantage
  - Pricing page with comparison to competitors
  - About/Trust page (team, security practices, encryption details)
  - Docs page (accessible, SSR-rendered)
- [ ] **Start blog with 5 foundational posts**
  - "What is zero-knowledge cloud storage?"
  - "Encrypted cloud storage comparison 2026"
  - "[Yourname] vs pCloud: honest comparison"
  - "[Yourname] vs Tresorit: pricing and features"
  - "Why we built [yourname]: affordable private storage"
- [ ] **Set up canonical tags properly**
  - Ensure www/non-www canonical is consistent
  - Self-referencing canonicals on every page

### Phase 3 — Medium Term (Month 2-3): Growth & Authority

- [ ] **Launch on Product Hunt**
  - Prepare assets: logo, screenshots, tagline, maker comment
  - Schedule for a Tuesday or Wednesday (highest traffic)
- [ ] **Submit to privacy directories**
  - PrivacyGuides.org (submit PR to their GitHub)
  - privacytools.io
  - AlternativeTo.net (create listing)
  - awesome-selfhosted GitHub list (if applicable)
- [ ] **Post on Hacker News**
  - "Show HN: [yourname] — Private cloud storage that costs less"
  - Prepare for technical questions
- [ ] **Build backlinks**
  - Guest posts on privacy/security blogs
  - Respond to "best encrypted cloud storage" articles
  - Create a security whitepaper (PDF) explaining your encryption model
- [ ] **Set up analytics**
  - Privacy-respecting: Plausible, Umami, or Fathom (NOT Google Analytics — your users will hate it)
  - Track: landing page conversions, sign-ups, docs engagement

### Phase 4 — Ongoing: Scale

- [ ] **Monitor Google Search Console weekly**
  - Track indexed pages, click-through rates, search queries
  - Fix crawl errors immediately
- [ ] **Publish 2-4 blog posts per month**
  - Target long-tail keywords
  - Update comparison posts quarterly
- [ ] **Upgrade database when needed**
  - Move to Neon Launch ($19/mo) or Supabase Pro ($25/mo) when you hit free tier limits
  - Don't hack around free tier limitations
- [ ] **Build email list**
  - Offer security newsletter or product updates
  - Email is your owned channel — social media algorithms can't take it away

---

## PART 3: CLAUDE CODE PROMPT

Use this prompt when working with Claude Code to fix the technical issues:

```
You are helping me fix critical SEO and technical issues on my web application.

## Context
- Product: Private encrypted cloud storage platform (competitor to pCloud, Tresorit, Filen)
- Backend: Go (Golang)
- Current domain: zcrypt.cloud (planning to rebrand)
- Current problem: The entire site is client-side JavaScript rendered. Crawlers (Google, etc.) see an empty HTML shell. Zero pages are indexed by Google.

## Current Architecture Issues
1. The Go backend serves a minimal HTML file that loads a JS bundle
2. All content (landing page, docs, pricing, features) renders only after JS executes
3. No sitemap.xml exists
4. No robots.txt exists
5. No meta tags, Open Graph tags, or structured data in the server response
6. No <noscript> fallback
7. No semantic HTML (<h1>, <header>, <main>, <nav>) in the initial server response

## What I Need You To Do

### Task 1: Server-Side Rendering / Pre-rendering
- Analyze my current frontend setup and recommend the best SSR approach
- If I'm using React: help migrate to Next.js with SSR/SSG for public pages
- If I'm using plain JS/HTML: help my Go backend serve pre-rendered HTML
- Ensure these pages serve full HTML on first load (no JS required for content):
  - `/` (landing page)
  - `/docs` (documentation)
  - `/pricing`
  - `/about`
  - `/blog` and `/blog/*` (individual posts)
- The `/app` and `/dashboard` routes can remain client-side rendered (they're behind auth)

### Task 2: SEO Infrastructure
Create or update these files:

**sitemap.xml** — Dynamic, auto-updating sitemap listing all public pages
**robots.txt** — Allow crawling of public pages, disallow `/app/`, `/dashboard/`, `/api/`

For every public page, ensure the HTML response includes:
- Unique `<title>` tag (under 60 chars)
- `<meta name="description">` (under 155 chars)  
- `<meta name="robots" content="index, follow">`
- `<link rel="canonical" href="...">` (self-referencing)
- Open Graph tags: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
- Twitter Card tags: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- Structured data (JSON-LD) in <script type="application/ld+json">:
  - Organization schema on homepage
  - Product schema on pricing page
  - BreadcrumbList on all inner pages

### Task 3: Semantic HTML
Ensure the server-rendered HTML uses:
- Single `<h1>` per page (unique, keyword-rich)
- Proper heading hierarchy (`<h1>` → `<h2>` → `<h3>`)
- `<header>`, `<nav>`, `<main>`, `<article>`, `<footer>` elements
- `alt` attributes on all images
- `<noscript>` tag with fallback content explaining the site requires JS for the app, but showing basic product info

### Task 4: Performance
- Ensure critical CSS is inlined or loaded with high priority
- Lazy-load images below the fold
- Add `loading="lazy"` and `decoding="async"` to non-critical images
- Minimize JS bundle size for public pages (they should be mostly static HTML)
- Add appropriate cache headers for static assets

### Constraints
- Do NOT break the existing app functionality behind `/app` or `/dashboard`
- Keep the Go backend as the primary server
- All changes must be backwards-compatible with existing API routes
- Use semantic, accessible HTML throughout
- Prioritize page load speed — these are marketing pages, they should be fast

### Output Format
- Show me the file changes needed
- Explain any architectural decisions
- If you need to see my current code structure first, ask me
```

---

## PART 4: DOMAIN RECOMMENDATIONS (if rebranding)

### Clean names with zero Google collisions:

| Name | Available to check | Why it works |
|------|-------------------|--------------|
| bytefort | `.com` / `.io` | "Byte" = data, "Fort" = fortress. Developer-friendly, secure feel |
| storveil | `.com` / `.io` | "Stor" = storage, "Veil" = hidden. Elegant, privacy-focused |
| enclova | `.com` / `.io` | Sounds like "enclave" + "cloud." Modern SaaS feel |
| drophaven | `.com` / `.io` | "Drop" = upload, "Haven" = safe place. Intuitive |
| vestcloud | `.com` / `.io` | "Vest" = protect, "Cloud" = obvious. Clean |
| lockstash | `.com` / `.io` | Direct: you lock and stash your files |
| boxveil | `.com` / `.io` | Dropbox meets privacy. Instant recognition |

### Where to buy (cheapest to most expensive for .com):

| Registrar | Year 1 | Renewal | 3-Year Total | Notes |
|-----------|--------|---------|-------------|-------|
| Cloudflare | ~$10.44 | ~$10.44 | ~$28 | At-cost pricing, zero markup. Must use their DNS. |
| Porkbun | ~$11.08 | ~$11.08 | ~$31 | Flat pricing, free WHOIS, free SSL. **Best overall.** |
| Dynadot | ~$10.88 | ~$10.88 | ~$30 | Flat rate. Good bulk tools. |
| Namecheap | ~$6.49 | ~$18.48 | ~$48 | Cheap year 1, expensive renewals. Bait pricing. |
| Hostinger | ~$9.99 | ~$15.99 | ~$42 | Not recommended for domains. |
| GoDaddy | ~$2.99 | ~$22.99 | ~$49+ | Worst long-term value. Avoid. |

**Recommendation: Buy from Porkbun.** Best balance of price, simplicity, and flexibility.

---

## SUMMARY: Priority Action Items

1. 🔴 **Fix SSR immediately** — nothing else matters until Google can read your pages
2. 🔴 **Submit to Google Search Console** — verify domain, submit sitemap
3. 🔴 **Seriously consider rebranding** — the ransomware association is a permanent handicap
4. 🟡 **Create 5 foundational content pages** — landing, features, pricing, docs, one blog post
5. 🟡 **Launch on Product Hunt + Hacker News** — first real traffic and backlinks
6. 🟡 **Get listed on privacy directories** — where your actual users discover products
7. 🟢 **Plan database migration** — budget $19-25/month for when you outgrow Neon free tier

---

*This document was generated on March 18, 2026 based on a live crawl and search analysis of zcrypt.cloud.*