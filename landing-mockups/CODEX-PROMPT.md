# Prompt for Codex — Redesign the zcrypt landing page

> Paste everything below the line into Codex. It is self-contained.

---

You are a senior product designer + front-end engineer. Design and build a **landing page** for **zcrypt** that is genuinely distinctive and shipping-quality — not a generic SaaS template. I have seen "competent but forgettable" attempts already; I want a page with a strong point of view that a privacy-conscious developer would actually stop and read.

**Save your deliverable to exactly this path in the repo: `landing-mockups/codex.html`** (a single self-contained HTML file). Write the file; don't just print it.

## What zcrypt is (be accurate — the audience will fact-check)

zcrypt is **zero-knowledge, encrypted cloud storage**. Files are encrypted **on the user's device** before they leave; the server never sees plaintext or keys. It is **open-source** and **BYOB** (Bring Your Own storage Backend — the user connects their own GitHub / GitLab / Hugging Face account, and zcrypt stores encrypted, chunked blobs there). There is a **web app**, a **Go terminal app (TUI)** with vim-style keys, and a **desktop app**.

**Real, verifiable mechanics (use these, don't invent specs):**
- Client-side **AES-256-GCM** encryption; key derived with **PBKDF2-SHA256, 600,000 iterations**, locally — never transmitted.
- **Envelope encryption**: each file gets a random Content-Encryption-Key (CEK); the CEK is wrapped with the user's passphrase-derived key. Sharing works by wrapping the CEK with a per-share key that travels **only in the URL fragment (`#…`)**, so the server never sees it.
- **zstd** compression before encryption; automatic **chunking** (~10 MB chunks) so there's no per-file size limit (though total capacity is bounded by the user's own storage account).
- **No passphrase recovery** — if the user loses their passphrase, the data is unrecoverable, by design. Treat this as an honesty point, not something to hide.

## Positioning (this is the spine — get it right)

The page sells two intertwined things: **(1) free & open-source + BYOB**, and **(2) privacy-first, developer-friendly**. The pitch is essentially: *"Encrypted storage you don't have to trust us about — because you can read the code and you bring your own storage."*

## HARD honesty rules (a security audience punishes hype — violate these and the page fails)

- **No** fake social proof: no "Trusted by thousands," no testimonials, no user counts, no "chosen by 8/10 users."
- **No** hype/empty claims: ban the words **"military-grade," "revolutionary,"** "bank-level," and vague compliance badges ("GDPR compliant") unless literally true and verifiable.
- **No** pricing tiers, **no** competitor price tables, **no** "cheaper than Dropbox," **no** "$9/2TB." It's free & open-source now.
- **No** dead-end claims. The whole pitch is "audit the code yourself" — so **every** "read the source / open the crypto module" link must point somewhere real, or be clearly framed. (If the repo isn't public yet, use an honest placeholder/"coming soon" state rather than a link that 404s. A 404 on "audit it yourself" destroys the entire thesis.)
- **Be honest about maturity.** zcrypt is **in active development / early**. State this near the hero or the primary CTA *with conviction* (disclosed immaturity reads as honest and on-brand; hidden immaturity in 8px footer text reads as a bluff). Don't present the desktop app as polished if it's an early shell.
- **Be precise about "we hold nothing."** The server *does* keep an encrypted index/metadata DB. Say "we never hold your files in readable form / your encrypted chunks live on your own storage," not a blanket "we store nothing."

Replace all the banned stuff with **real trust signals**: link to the source, show the actual crypto, explain BYOB, show the TUI, and lean into "don't trust us — verify."

## Design direction (this is where I want you to be bold)

I want **one cohesive, opinionated design**, not a feature checklist. Pick a strong concept and commit to it. Good directions for this audience (pick one or fuse two — your call, justify it briefly in a top-of-file comment):

- **Developer / terminal-native**: monospace accents, command-line motifs, code-and-crypto as the hero, a GitHub-native feel. Leans into the TUI + open-source identity.
- **Transparency / manifesto**: privacy-as-a-stance, big honest statements, the real encryption boundary (device vs server) shown as the centerpiece — "read the code" as the call to action.
- **Apple-grade product page**: enormous confident typography, generous whitespace, scroll-driven reveals, real depth/3D — but only if every effect serves the message (no effect-soup).

**Components worth including** (these tested well as ideas — but make them cohere, don't just stack them):
- An **encryption-boundary diagram** (what happens on your device vs. what the server ever sees) — this is the single clearest way to convey zero-knowledge in 5 seconds. Make it a centerpiece.
- A **terminal / TUI showcase** (the product genuinely has one).
- A **"how it works" flow**: drop → compress (zstd) → encrypt (AES-256-GCM, on device) → chunk → store on *your own* backend. Show it **once** — do not repeat the same pipeline message in three different sections (a common failure).
- A short, honest **FAQ** (crypto, BYOB, multi-device, the TUI, lost-passphrase tradeoff). No pricing questions.

**Avoid the "vibe-coded" smell:** no gratuitous motion (magnetic buttons, konami easter eggs, pencil-underline doodles, animated counters everywhere). Motion must earn its place. One clear visual hierarchy. One primary CTA.

## Brand / visual tokens (match these)

- **Dark-first** (this is the primary identity). Dark palette: background `#0c0f1a`, surface `#141829`, elevated surface `#1c2039`, border `#1e2340`, text `#f0f2f8`, secondary text `#9ea3c0`. **Accent: cyan `#00d5e4`** (hover `#2de0ed`).
- Light mode (if you do one): bg `#e9ecf4`, surface `#f7f8fb`, text `#1a1f36`, accent `#0093a3`. If light mode can't be made to look intentional, **ship dark-only** rather than a broken toggle.
- Font: **Poppins** (Google Fonts) for both body and headings — unless your concept deliberately uses a mono/display face, then load that too.

## Technical requirements

- Deliver a **single, self-contained `.html` file** (inline CSS + JS) that renders correctly when opened directly in a browser (`file://`). You may load Google Fonts and, if your concept needs 3D, a CDN build of Three.js — but include a **graceful fallback** if WebGL/CDN fails (never ship a blank canvas).
- **Responsive**: must work on mobile. Include a **working mobile nav** (hamburger/drawer) — don't leave mid-width/mobile users with no navigation (a common miss).
- **Accessible**: semantic HTML, focus states, alt text, sufficient contrast, and full **`prefers-reduced-motion`** support (disable non-essential animation).
- **Performant**: if you use a `requestAnimationFrame` loop, guard it so scroll/tab-visibility handlers can't spawn multiple concurrent loops (a real leak to avoid). Keep JS lean.
- Primary CTA `href="/register"`. (If you treat the product as pre-launch per the honesty rules, an honest CTA like "Star on GitHub" / "Try the TUI" / "Join early access" is also acceptable — your judgment, but make it lead somewhere real.)
- Wordmark: **zcrypt**, lowercase.

## Deliverable

One impressive, honest, cohesive `landing.html`. At the top, add an HTML comment (2–4 lines) explaining the concept you chose and why it fits a zero-knowledge, open-source, developer-privacy product. Then build the whole page — hero through footer — not a fragment.

Make it the kind of page where a skeptical developer thinks "okay, these people actually get it" within five seconds. That's the bar.
