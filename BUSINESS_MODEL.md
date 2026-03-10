# Zcrypt — Business Model & Strategy

**Document Version:** 1.0
**Date:** March 2026
**Product:** zcrypt.cloud — Zero-knowledge encrypted cloud storage

---

## 1. What Zcrypt Is

Zcrypt is a zero-knowledge encrypted cloud storage platform. Files are compressed, encrypted, and chunked entirely on the client side before leaving the user's device. The server never sees plaintext data, keys, or passphrases. Even Zcrypt as a company cannot access user files.

**Core pipeline:** File → Zstd Compression → AES-256-GCM Encryption → 10MB Chunking → Storage Backend

---

## 2. The Market Problem

Cloud storage is a $100B+ market dominated by providers who:

- **Can see your files.** Google Drive scans content. Dropbox holds encryption keys. iCloud has server-side access.
- **Charge egress fees.** AWS S3 charges $90/TB for data transfer out.
- **Lock you in.** Migrating between providers is painful by design.
- **Overcharge on margins.** AWS S3 costs $23/TB/month. A 4TB hard drive costs $80 one-time. The markup is 1000%+.

Privacy-conscious alternatives exist (Proton Drive, Tresorit) but are expensive and feature-limited.

---

## 3. Zcrypt's Position

**"Cloud storage only you can see."**

| Differentiator | Zcrypt | Dropbox | Google Drive | Proton Drive |
|---|---|---|---|---|
| Zero-knowledge encryption | Yes | No | No | Yes |
| Provider can see files | No | Yes | Yes | No |
| Egress fees | $0 | None | None | None |
| Bring-your-own backend | Yes | No | No | No |
| Open source | Yes | No | No | Partial |
| Starting price | $0 | $12/mo | $3/mo | $4/mo |
| Storage at $6/mo | 100 GB | — | 100 GB | 200 GB |

Zcrypt's moat is the combination of **true zero-knowledge encryption + bring-your-own-backend flexibility + price advantage**.

---

## 4. Product Architecture

### Three-Layer Storage Model

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Zcrypt Managed Storage (Default)          │
│  → Cloudflare R2 / Backblaze B2                     │
│  → User sees: "cloud storage"                       │
│  → User never touches infra                         │
│  → Zcrypt pays ~$5-15/TB/month, charges users $6/mo │
├─────────────────────────────────────────────────────┤
│  Layer 2: Bring Your Own Platform (Pro)             │
│  → User connects GitHub / GitLab / HuggingFace      │
│  → Files go to user's own repos via Git LFS          │
│  → User owns the storage, Zcrypt provides encryption │
├─────────────────────────────────────────────────────┤
│  Layer 3: Bring Your Own S3/WebDAV (Business)       │
│  → Company connects their Backblaze / R2 / MinIO     │
│  → Zcrypt is pure encryption + management layer      │
│  → On-prem / self-host option                        │
└─────────────────────────────────────────────────────┘
```

**Layer 1** is the default experience. Sign up, drop files, done. No tokens, no Git knowledge, no setup friction. This is what makes Zcrypt a product, not a tool.

**Layer 2** is the power-user differentiator. Users who want to control their own storage can bring their own Git platform credentials. This is what no competitor offers.

**Layer 3** is the enterprise play. Companies connect their own S3-compatible storage. Zcrypt becomes a pure encryption and management layer.

---

## 5. Pricing

### Tiers

| | **Free** | **Plus** ($6/mo) | **Pro** ($12/mo) | **Team** ($9/user/mo) |
|---|---|---|---|---|
| Storage | 5 GB | 100 GB | 1 TB | 500 GB/seat |
| Max file size | 200 MB | 2 GB | 10 GB | 10 GB |
| Encryption | AES-256-GCM | AES-256-GCM | AES-256-GCM | AES-256-GCM |
| Concurrent uploads | 1 | 5 | 10 | 10 |
| Encrypted sharing links | 3/month | 50/month | Unlimited | Unlimited |
| Folder auto-sync | No | 1 folder | 5 folders | Unlimited |
| CLI access | No | Yes | Yes | Yes |
| Photo gallery (encrypted) | No | Yes | Yes | Yes |
| File versioning | No | 5 versions | 30 days | 30 days |
| Bring your own platform | No | No | Yes | Yes |
| Bring your own S3/WebDAV | No | No | Yes | Yes |
| Team/shared vaults | No | No | No | Yes |
| Audit log | No | No | No | Yes |
| SSO (SAML) | No | No | No | Yes |
| Priority processing | No | Yes | Yes | Yes |

### Why These Prices Work

- **Free (5GB):** Generous enough to be useful. Hooks users. Converts to paid when they hit limits naturally.
- **Plus ($6/mo):** Impulse-buy price. Undercuts Dropbox ($12/mo) by 50%. 100GB covers 90% of personal users.
- **Pro ($12/mo):** Matches Dropbox pricing but with 1TB + zero-knowledge + BYOB. Clear value over competitors.
- **Team ($9/user/mo):** Below enterprise pricing ($15-25/user/mo typical). Shared vaults + audit logs sell to CTOs.

### Annual Discount

- Plus: $6/mo → $4.50/mo billed annually ($54/year)
- Pro: $12/mo → $9/mo billed annually ($108/year)
- Team: $9/user/mo → $7/user/mo billed annually

Annual billing improves cash flow and reduces churn.

---

## 6. Revenue Model & Unit Economics

### Cost Structure (Per TB/Month)

| Cost | Amount |
|---|---|
| Cloudflare R2 storage | $15/TB/month |
| Backblaze B2 storage (alternative) | $5/TB/month |
| R2 egress | $0 |
| Neon Postgres (DB) | ~$20/month flat |
| Railway (backend hosting) | ~$10/month flat |
| Vercel (frontend hosting) | $0-20/month |
| Resend (email) | ~$20/month |
| **Total infra per month** | **~$70 + $5-15/TB** |

### Average User Storage Consumption

Based on industry benchmarks (Dropbox S-1 data):
- Free users average: 0.5 GB
- Paid users average: 30-50 GB
- Power users: 200+ GB

### Unit Economics at Scale

| Metric | Value |
|---|---|
| Average paid user stores | ~40 GB |
| COGS per paid user (R2) | ~$0.60/month |
| Revenue per Plus user | $6/month |
| **Gross margin per user** | **~90%** |
| Revenue per Pro user | $12/month |
| COGS per Pro user (avg 100GB) | ~$1.50/month |
| **Gross margin per Pro user** | **~87%** |

Cloud storage SaaS at 85-90% gross margins is an extremely attractive business.

---

## 7. Revenue Projections

### Conservative Scenario

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Free users | 5,000 | 20,000 | 50,000 |
| Free → Paid conversion | 3% | 4% | 5% |
| Paid users | 150 | 800 | 2,500 |
| Avg revenue per paid user | $7/mo | $8/mo | $9/mo |
| **MRR** | **$1,050** | **$6,400** | **$22,500** |
| **ARR** | **$12,600** | **$76,800** | **$270,000** |
| Storage COGS | ~$200/mo | ~$1,500/mo | ~$6,000/mo |
| Fixed infra | ~$70/mo | ~$150/mo | ~$300/mo |
| **Gross margin** | ~74% | ~74% | ~72% |

### Optimistic Scenario (Product-market fit achieved)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Free users | 10,000 | 50,000 | 150,000 |
| Paid users | 400 | 3,000 | 12,000 |
| **ARR** | **$33,600** | **$288,000** | **$1,296,000** |

---

## 8. Growth Strategy

### Phase 1: Launch & Developer Adoption (Months 1-6)

**Goal:** 5,000 free users, 100 paid users

- Launch on Product Hunt, Hacker News, r/selfhosted, r/privacy
- Ship CLI tool (`zcrypt push`, `zcrypt pull`) — developers are the early adopters
- Open-source the client-side encryption library (trust builder)
- Content marketing: "How cloud storage providers see your files" (privacy angle)
- SEO: Target "encrypted cloud storage," "zero knowledge storage," "private file storage"

### Phase 2: Sharing as Viral Loop (Months 6-12)

**Goal:** 20,000 free users, 500 paid users

- Ship encrypted sharing links — every shared file is a marketing event
- Recipient visits zcrypt.cloud/s/abc123 → enters passphrase → sees file → sees Zcrypt
- Referral program: Give 1GB bonus storage for each referral
- Ship encrypted photo gallery (private photo vault is a massive market)

### Phase 3: Teams & Business (Months 12-24)

**Goal:** 50,000 free users, 2,500 paid users

- Ship team vaults with role-based access
- Add SSO/SAML for enterprise
- Compliance documentation (SOC2 narrative — zero-knowledge simplifies this)
- Outbound sales to privacy-conscious companies (legal, healthcare, finance)

### Phase 4: Platform (Months 24+)

- API for developers to build on Zcrypt encryption
- Mobile apps (iOS/Android)
- Desktop sync client (Tauri-based, already started)
- Marketplace for storage backends

---

## 9. Features Roadmap — Priority Order

### Must-Have for Launch (Pre-Revenue)

| Feature | Why | Effort |
|---|---|---|
| Stripe integration | Can't charge without it | 1 week |
| Cloudflare R2 adapter | Default managed storage backend | 1-2 weeks |
| Plan enforcement | Free/Plus/Pro limits actually enforced | 3 days |
| Landing page update | New brand, pricing page, CTA to paid | 1 week |

### High-Impact for Growth (Months 1-6)

| Feature | Why | Effort |
|---|---|---|
| Encrypted sharing links | Viral loop — every share = marketing | 1-2 weeks |
| CLI tool | Developer adoption + CI/CD stickiness | 1 week |
| Folder auto-sync | Subscription justifier ("set and forget") | 2 weeks |
| Mobile PWA | Access from phone without app store | 1 week |

### Revenue Multipliers (Months 6-12)

| Feature | Why | Effort |
|---|---|---|
| Encrypted photo gallery | Massive market (Ente Photos competitor) | 2-3 weeks |
| File versioning | Prevents accidental data loss, justifies Pro | 1 week |
| Team vaults | Unlocks $9/user/mo Team tier | 2-3 weeks |
| S3/WebDAV adapter | Enterprise BYOB play | 1 week |

### Moat Builders (Months 12+)

| Feature | Why | Effort |
|---|---|---|
| Native mobile apps | Retention + daily usage | 2-3 months |
| SSO/SAML | Enterprise requirement | 2 weeks |
| Audit log + compliance docs | Sell to regulated industries | 2 weeks |
| Developer API | Platform play | 1 month |

---

## 10. Competitive Landscape

### Direct Competitors

| Competitor | Price | Storage | Zero-Knowledge | BYOB | Weakness |
|---|---|---|---|---|---|
| Proton Drive | $4/mo | 200 GB | Yes | No | Slow, limited features, no sharing links |
| Tresorit | $11/mo | 1 TB | Yes | No | Expensive, enterprise-focused |
| Ente Photos | $3/mo | 100 GB | Yes | No | Photos only, no general storage |
| Filen | $2/mo | 200 GB | Yes | No | Small team, reliability concerns |
| **Zcrypt** | **$6/mo** | **100 GB** | **Yes** | **Yes** | **New, unproven** |

### Indirect Competitors

| Competitor | Price | Why People Use It | Zcrypt's Advantage |
|---|---|---|---|
| Dropbox | $12/mo, 2TB | Ubiquity, sharing | Half the price, actually encrypted |
| Google Drive | $3/mo, 100GB | Gmail integration | Google literally scans your files |
| iCloud | $3/mo, 200GB | Apple ecosystem | Apple holds the keys |
| OneDrive | $2/mo, 100GB | Microsoft 365 bundle | Microsoft holds the keys |

### Zcrypt's Positioning

```
              High Privacy
                  │
    Tresorit      │      Zcrypt
    (expensive)   │      (affordable + BYOB)
                  │
 ─────────────────┼──────────────────
    Expensive     │      Affordable
                  │
    Dropbox       │      Google Drive
    (no privacy)  │      (no privacy)
                  │
              Low Privacy
```

Zcrypt owns the **affordable + high privacy** quadrant. No one else is there.

---

## 11. Legal Structure

### How Zcrypt Stays Clean

1. **Managed storage (Layer 1):** Zcrypt uses legitimate paid storage (Cloudflare R2 / Backblaze B2). No TOS issues. Standard business.

2. **BYOB Git platforms (Layer 2):** The user connects their own platform account with their own credentials. Zcrypt acts as an authorized agent of the user. The user is responsible for complying with their platform's TOS.

3. **Terms of Service language:**
   - "Users are responsible for complying with the terms of service of any third-party platform they connect to Zcrypt."
   - "Zcrypt acts as an authorized agent of the user, operating with user-provided credentials."
   - "Zcrypt is an encryption and file management service. Choice of storage backend is solely the user's decision."

4. **Filename privacy (formerly "disguise"):** Filenames are hashed for privacy purposes (a legitimate security feature), not to evade platform detection. Reframe from "disguise" to "filename privacy" in code and documentation.

5. **Corporate entity:** Register as an LLC or C-Corp. Standard SaaS terms, privacy policy, and DPA (Data Processing Agreement) for business customers.

---

## 12. Key Metrics to Track

| Metric | Target (Year 1) |
|---|---|
| Free signups | 5,000 |
| Free → Paid conversion rate | 3%+ |
| Monthly churn (paid) | <5% |
| MRR | $1,000+ |
| Average revenue per user | $7+ |
| Net Promoter Score | 40+ |
| Sharing links generated/month | 500+ |
| CLI installs | 1,000+ |

---

## 13. Funding Strategy

### Option A: Bootstrap

- COGS are near-zero until significant scale
- Solo founder can run this profitably at 500 paid users (~$3,500 MRR)
- Keep full ownership, grow organically
- Timeline to profitability: 6-12 months

### Option B: Pre-Seed Raise ($100-250K)

- Use for: mobile apps, marketing spend, design polish
- Pitch: "Proton Drive for the next generation. Zero-knowledge storage at half the price with BYOB flexibility."
- Target: privacy-focused angels, indie VCs (Calm Fund, TinySeed)
- Give up: 5-10% equity

### Recommendation: Bootstrap first. Hit $5K MRR. Then decide.

---

## 14. 90-Day Launch Plan

### Weeks 1-2: Infrastructure
- [ ] Add Cloudflare R2 storage adapter (S3-compatible)
- [ ] Integrate Stripe (subscriptions, checkout, billing portal)
- [ ] Implement plan enforcement (storage limits, file size limits, feature gates)

### Weeks 3-4: Rebrand & Landing
- [ ] Rename to Zcrypt across codebase
- [ ] Update landing page with pricing, new brand, CTAs
- [ ] Build pricing page with Stripe checkout
- [ ] Rename `disguise/` to `privacy/` — reframe as filename hashing

### Weeks 5-6: Sharing (Viral Feature)
- [ ] Build encrypted sharing links (generate link → recipient enters passphrase → decrypts in browser)
- [ ] Add sharing limits per plan (3/50/unlimited)
- [ ] Sharing landing page (zcrypt.cloud/s/{id}) with Zcrypt branding + signup CTA

### Weeks 7-8: CLI
- [ ] Ship `zcrypt` CLI tool (push, pull, ls, share)
- [ ] Publish to Homebrew, npm, pip
- [ ] Write "Getting Started with Zcrypt CLI" guide

### Weeks 9-10: Polish
- [ ] Mobile-responsive PWA
- [ ] Onboarding flow for managed storage (no Git tokens needed)
- [ ] Encrypted photo gallery view for image files

### Weeks 11-12: Launch
- [ ] Product Hunt launch
- [ ] Hacker News "Show HN" post
- [ ] r/privacy, r/selfhosted, r/degoogle posts
- [ ] Dev.to / Medium launch article
- [ ] Twitter/X launch thread

---

## 15. One-Line Summary

**Zcrypt is zero-knowledge encrypted cloud storage that costs half of Dropbox, is more private than iCloud, and lets power users bring their own storage backend. Even we can't see your files.**

---

*zcrypt.cloud — Cloud storage only you can see.*
