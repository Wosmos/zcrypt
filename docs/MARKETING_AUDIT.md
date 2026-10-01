# zcrypt marketing and funnel audit

Date 2026-09-20. Inputs: the live site, the source, production database counts, five review lenses, and an adversarial re-check of the top five causes.

## 1. Straight answer

Yes, the landing page is too hard for a non-coder to understand, and no, that is not the main reason conversion is far from 100 percent. The page is written for the person who built it. In 1,593 words it says encrypt 38 times, repo 12, terminal 10, AES-256-GCM 9, and never names a thing a normal person owns or a moment they have lived through. It never states the price, shows no product above the fold, and its first objection card tells anyone without a GitHub account to leave. A non-coder concludes it is a programmer's tool and is right to leave.

The larger loss is after signup. 22 people verified an email, 8 ever stored a file, 2 connected their own storage. The 22 to 8 drop has a code cause: the admin's global token makes every platform report connected, so the onboarding redirect never fires. Fix the funnel first, then the page. A better hero pours more visitors into a pipe that drops two thirds of them.

One caveat governs everything below: 32 users is not a sample, the bounce rate was never exported, and this is argued from code and copy.

## 2. The funnel

| Stage | Count | Drop | What it means |
|---|---|---|---|
| Visits to / | not exported | "enormous" bounce, qualitative | Every landing-page claim below is inferred |
| Signups | 32 | | 4 in the last 30 days |
| Email verified | 22 | 10 lost (31%) | `app/frontend/app/(auth)/register/page.tsx` sends every production signup to a "check your email" dead end. `app/backend/cmd/auth.go` HandleLogin never checks EmailVerified, so the backend does not require it |
| Stored a file | 8 | 14 of 22 lost (64%) | Onboarding is unreachable (cause 1). New users land on an empty dashboard |
| Connected own storage | 2 | 6 of 8 uploaders used the global token | The bring-your-own-storage flow, a repo-scoped Personal Access Token, converts 2 of 32 |
| Installer downloads | 27 | | Against 32 signups, the traffic that converts skews technical |

## 3. What a first-time visitor sees

At 1440x900 the first screen holds a pill, "The Encrypted Drive You Actually Own", a 26-word subhead with a parenthetical, and one button, "Create your vault". No price, no product image, no competitor, no second action. `app/frontend/components/marketing/marketing-hero.tsx` accepts a `trustItems` prop and `components/marketing/landing/hero-section.tsx` passes none, so the trust row renders empty. At 390x844 the same, under a header with only a logo, a theme toggle and a hamburger.

Below the fold: a 12-item marquee, then the product showcase, an iframe of `/demo` inside an iMac bezel. The first look at the real product reads "Demo mode, all data is simulated. Uploads, downloads and deletes are disabled", then "Read-only demo, uploads are disabled", then a leaked test strip labelled "Switch component", "Toggle component", "ToggleGroup component" (`app/frontend/app/demo/demo-client.tsx` L322 to L366). Then how-it-works names PBKDF2-SHA256, zstd and AES-256-GCM. The page runs 12,453px on desktop and 15,656px at 500px wide, where the two in-flow signup links sit at y=484 and y=14418.

Lighthouse desktop: SEO 100, Best Practices 96, Accessibility 88. The failing contrast item is the marquee's own promise, "ZERO-KNOWLEDGE: WE CAN'T READ YOUR FILES", at 2.11 against 3:1, plus 8 unlabelled icon buttons. LCP 650ms desktop, 1,379ms mobile emulated, CLS 0.00 on both. Speed is not why people leave.

## 4. Root causes, ranked

The top five went through an adversarial check. None is a proven cause of bounce; the behaviour data does not exist.

| # | Cause | Evidence | Verdict |
|---|---|---|---|
| 1 | Onboarding is silently skipped for every account | `app/frontend/components/auth/auth-guard.tsx` redirects to /onboarding only when no status is connected. `app/backend/index/token_queries.go` selects `WHERE user_id = $1 OR is_global = TRUE`; `app/backend/cmd/platforms.go` marks each merged adapter Connected. One global token kills the redirect; /onboarding has no other entry point | Partly supported. Defect confirmed. Refuted: it is not "the only explainer" (`vault-first-time-warning.tsx` exists) and it runs behind auth, so it cannot cause bounce on /. An activation defect |
| 2 | The hero answers none of: what is it, what does it cost, why is it better, what if I am not ready | `hero-section.tsx`: property-claim headline, one commitment CTA. Proton, Filen and Tresorit each put price, proof and a second action on screen one | Partly supported. Subhead is 26 words, not 33. No data ties bounce to the hero |
| 3 | The product is free and the page never says so where anyone looks | "free" appears twice in visible copy, at 61% and 88% depth, neither about zcrypt's price. The answer sits in a collapsed accordion, `app/frontend/lib/data.ts` L196. No Pricing nav item or route | Speculative as a bounce cause. Facts confirmed; the meta description does say free. Unproven, still the cheapest fix |
| 4 | The page tells non-coders to leave, and the claim is false | `app/frontend/app/(marketing)/page.tsx` L82 to L85: "Do I need a GitHub account? Yes, and that's the point." `app/backend/cmd/upload.go` falls back to the global token; 6 of 8 uploaders connected nothing | Partly supported. Falsity confirmed. The "6 times" count was wrong (2 hits). The card sits deep; the hero subtext's "accounts you already own" is the likelier deterrent |
| 5 | The only close-up of the product is a leaked component gallery inside the homepage iframe | `demo-client.tsx` L322 to L366; `components/marketing/macos-showcase.tsx` L1226. Reproduced live at 390px and 2000px | Partly supported. Bug confirmed. Causal weight unproven |
| 6 | A working zero-commitment demo is unreachable | 0 of 44 homepage anchors link /demo; entry is a fake dock icon using `window.open`. `app/frontend/app/demo/layout.tsx` has two "#" links and no signup CTA | Not checked |
| 7 | Every trust element is legible only to engineers | Largest section leads with a terminal; zero-knowledge asserted 11 times before defined; 0 of 12 headings about what you would store | Not checked |
| 8 | Forced email verification the backend does not require | See funnel. Register shows no password rules while `auth.go` validatePassword enforces four | Not checked |
| 9 | "Link an account you already have" versus a repo-scoped PAT | `app/frontend/app/(onboarding)/onboarding/page.tsx` L200 sends users to github.com/settings/tokens/new. No storage OAuth exists | Not checked |
| 10 | Capacity cards show rotation thresholds as user capacity | `components/marketing/landing/storage-platforms.ts`: 850 MB, 9 GB, 90 GB, 50 MB/file. Contradicts `lib/platforms.ts`, which lists Telegram as Unlimited | Not checked |
| 11 | Mobile has one CTA, then nothing for 13,934px | Anchor scan at 500px. No sticky CTA | Not checked |
| 12 | Two secrets both called password; the unrecoverable one appears mid-upload | `register/page.tsx`, `components/ui/passphrase-modal.tsx`, `vault-first-time-warning.tsx` never reference each other | Not checked |
| 13 | No third-party proof | No user count, audit, testimonial or star count. Wosmos/zcrypt has 0 stars | Not checked |
| 14 | The best copy is on /about, the last nav item | `app/frontend/app/(marketing)/about/_data/about.tsx` L91 to L121 | Not checked, medium confidence |
| 15 | The stealth pitch reads as smuggling; "Is this allowed?" dodges | `components/marketing/landing/built-to-trust.tsx` card 03; `page.tsx` objection 2 | Not checked, medium confidence |
| 16 | Credibility cracks | `lib/data.ts` L232 install command hits a 404 and feeds FAQ JSON-LD; "Military-grade security" in `app/frontend/app/(auth)/layout.tsx` L19; "zcrypt.com" in `macos-showcase.tsx` L618; six surviving `&mdash;` entities | Not checked |

## 5. Keep

- The encryption boundary section, "There's a line your files cross", with real ciphertext. Move it up, change only the headline.
- The origin story in `about/_data/about.tsx` L91 to L121. Do not rewrite a word. Promote it.
- The BuiltBy block: a named maker, a city, a portfolio link. Only its position is wrong.
- `/demo` as an asset, and the macOS and iPad showcase engineering. Expose them, do not rebuild them.
- `/vs/google-drive`, `/vs/dropbox`, `/vs/proton-drive`. Honest and aimed at switcher queries.
- The FAQ content, including the hard passphrase answer. Only the accordion is wrong.
- Technical SEO, docs depth, the visual identity, performance. Send no work at any of these.
- The vault first-time warning copy, the Telegram auto-detect flow, `lib/platforms.ts` as the source of truth, the resumable upload design.

## 6. Proposals

### Quick wins (each under half a day)

| Change | Files |
|---|---|
| Delete the component demo strip from /demo | `app/frontend/app/demo/demo-client.tsx` |
| Rewrite the hero: price in the CTA, second CTA to /demo, pass `trustItems` (Free forever, No card, Open source) | `components/marketing/landing/hero-section.tsx` |
| Rewrite objection 1: no GitHub needed, start now, add your own account later | `app/(marketing)/page.tsx` |
| Pricing nav item plus a one-screen /pricing; lift the free answer out of the accordion | `lib/data.ts`, `app/(marketing)/page.tsx`, `app/sitemap.ts` |
| Link /demo from nav and footer, fix the "#" links, add a Start free CTA inside the demo | `app/demo/layout.tsx`, `app/demo/demo-client.tsx`, `lib/data.ts` |
| Sticky mobile CTA once the hero scrolls out | `app/(marketing)/page.tsx` |
| Capacity cards: import from `lib/platforms.ts`, lead with Telegram as unlimited | `components/marketing/landing/storage-platforms.ts`, `bring-your-own-storage.tsx` |
| Inline password rules on register; drop or derive username | `app/(auth)/register/page.tsx`, `app/backend/cmd/auth.go` |
| Credibility sweep: install command, "Military-grade", zcrypt.com, `&mdash;` | `lib/data.ts`, `app/(auth)/layout.tsx`, `macos-showcase.tsx`, `tui/page.tsx`, `terms/page.tsx`, `about/_data/about.tsx` |
| Marquee: 12 items to 4, lead with free, fix contrast, label the 8 icon buttons | `lib/data.ts`, `hero-section.tsx` |

### Restructure (days)

| Change | Files |
|---|---|
| Fix the onboarding skip: redirect when no status has `connected && !is_global` | `components/auth/auth-guard.tsx`, `app/backend/cmd/platforms.go` |
| Make shared storage a disclosed option: two-choice onboarding, honest empty state, show global rows in Settings | `app/(onboarding)/onboarding/page.tsx`, `app/(app)/dashboard/page.tsx`, `components/settings/settings-content.tsx` |
| Log users in after register; verify via in-app banner; gate only sharing and reset | `register/page.tsx`, `app/backend/cmd/auth.go` |
| Reorder the page: hero, live demo, encryption boundary, origin story, how it works, BYOS, the rest. Collapse the four sticky cards | `page.tsx`, `built-to-trust.tsx`, `macos-showcase.tsx` |
| Make /demo interactive: drop a file, encrypt in the browser, show ciphertext, nothing uploaded. Replace engineer sample files | `demo-client.tsx` |
| Name the two secrets; explain the vault passphrase before it is demanded | `register/page.tsx`, `passphrase-modal.tsx`, `onboarding/page.tsx` |
| Surface the /vs pages from the homepage | `page.tsx`, `lib/data.ts` |

### Revamp (weeks)

- Reposition around the origin story; demote zero-knowledge to a proof point. `about.tsx`, `hero-section.tsx`, `page.tsx`.
- OAuth for GitHub and GitLab storage connection, PAT kept as advanced. `app/backend/auth/oauth.go`, `lib/platforms.ts`, `onboarding/page.tsx`, `app/backend/adapters`.
- Split audiences: / for non-coders, /developers for terminal, CLI, self-hosting and threat model. Answer the platform-terms question directly. `page.tsx`, `built-to-trust.tsx`, `sitemap.ts`.
- A trust surface: public stats, MIT, open repo, and the longevity argument (your files stay in your account if zcrypt disappears). `page.tsx`, `lib/data.ts`, `app/backend/cmd/admin.go`.
- Rewrite the corpus under one rule: name a person, a file or a moment before an algorithm. One acronym; kill BYOB.

### Recommended hero

Headline: Free cloud storage that cannot read your files

Subhead: Everything is locked on your device before it uploads, so we could not open it if someone made us try. Start in one click. Plug in your own GitHub or Telegram account later if you want more room. No card, now or ever.

Primary CTA: Start free, no card. Secondary CTA: Look around first, no signup (to /demo). Nav button: Start free.

Caveat: "Start in one click" and "free" describe the global-token path, which today runs on the admin's personal token. Ship the disclosed shared-storage tier with this hero or the headline promises what the infrastructure has not agreed to.

## 7. Measure

Before changing anything, name the events: landing_view, hero_cta_click, demo_open, demo_file_encrypted, register_submit, register_success, verify_email_clicked, first_dashboard_load, onboarding_shown, storage_connected (platform, own vs global), first_upload_started, first_upload_completed. Vercel Analytics custom events cover the marketing half; the backend emits the rest.

One activation number: percent of accounts created in the last 30 days that stored a file within 24 hours. Today roughly 25 percent lifetime. Split it by own token versus global, with a token-source column on chunk writes so the split is measured, not inferred.

Scroll depth at 25, 50, 75 and 100 plus a section_reached event. This is the one measurement that separates "bounce on the hero" from "scroll, get interested, hit the token wall". Bounce by traffic source and device: if the traffic is Hacker News and Reddit, the terminal-forward page may be correctly targeted and the problem is acquisition.

Also: time-to-first-file median, the demo as its own funnel, verification deliverability at the mail provider, an alert if onboarding_shown stays at zero after the fix, a CI link check on the FAQ install command, Lighthouse accessibility held at 95 or above. A/B the hero as one unit for a fixed window with a pre-committed decision rule; nothing reaches significance at this volume.

## 8. Open questions

- Where do visitors leave: the hero, the demo, or the token wall? No scroll or exit data exists.
- Who is the traffic? Developer referrals would move the diagnosis from page to acquisition.
- ~~Does a global token exist right now, and for which platforms?~~ Answered after the audit by querying production: yes, two, HuggingFace (since 2026-06-24) and Telegram (since 2026-06-22). Cause 1 is therefore live for every account today, not hypothetical.
- Is the 31 percent verification loss friction or deliverability?
- Did the 6 shared-storage uploaders feel confused, or did the frictionless path simply work?
- Why 27 installer downloads against 32 signups?
- Are OAuth-login users confused when storage still asks for a PAT? Inferred from separate scopes, never observed.
