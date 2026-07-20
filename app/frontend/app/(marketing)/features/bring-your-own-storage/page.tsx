import type { Metadata } from "next";
import { Box, Lock, Server } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { STORAGE_PLATFORMS } from "@/components/marketing/landing/storage-platforms";
import { bringYourOwnStorage } from "../_data/bring-your-own-storage";

export const metadata: Metadata = {
  title: "Bring Your Own Storage — Your Data, Your Infrastructure",
  description:
    "zcrypt never sells you storage. Connect accounts you already own — GitHub, GitLab, Hugging Face, Telegram — and your encrypted files are stored as disguised chunks in repos you own. Repos rotate automatically as they fill, so your space grows on its own. No lock-in.",
  keywords: [
    "bring your own storage",
    "BYO storage",
    "self-hosted encrypted storage",
    "github as storage",
    "no vendor lock-in",
    "decentralized file storage",
    "encrypted storage backend",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/bring-your-own-storage" },
  openGraph: {
    title: "Bring Your Own Storage | zcrypt",
    description:
      "Connect GitHub, GitLab, Hugging Face, and Telegram accounts you already own. Encrypted files are stored as disguised chunks across repos you own, and repos rotate automatically as they fill. Your data, your infrastructure, no lock-in.",
    url: "https://zcrypt.cloud/features/bring-your-own-storage",
    type: "website",
  },
};

const adapters = STORAGE_PLATFORMS;

export default function BringYourOwnStoragePage() {
  const { hero, adaptersSection, capabilities, tieIn, related, cta } = bringYourOwnStorage;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          {
            name: "Bring your own storage",
            url: "https://zcrypt.cloud/features/bring-your-own-storage",
          },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        headlineTop={hero.headlineTop}
        headlineGradient={hero.headlineGradient}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      >
        {/* Adapters mock */}
        <MockWindowFrame label="Connected storage" labelIcon={Server} badgeIcon={Lock} badgeLabel="Encrypted before upload">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {adapters.map((a) => (
              <div
                key={a.name}
                className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-3 dark:bg-white/[0.02]"
              >
                <a.Icon className="h-5 w-5 text-cyan-500" />
                <div className="mt-2 text-xs font-semibold">{a.name}</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  {a.capacity}
                </div>
              </div>
            ))}
          </div>
          {/* chunk fan-out row */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
            <Box className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-01
              </span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-02
              </span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-03
              </span>
              <span className="text-[var(--color-text-muted)]">→ stored as build-cache in a repo you own</span>
            </div>
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ ADAPTERS DETAIL ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {adaptersSection.heading}
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {adaptersSection.subheading}
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none">
            {adapters.map((a) => (
              <li key={a.name}>
                <article className="card p-6 transition-colors hover:border-cyan-500/30">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                    <a.Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold">{a.name}</h3>
                  <p className="mt-1 font-mono text-xs text-cyan-600 dark:text-cyan-400">
                    {a.capacity}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {a.note}
                  </p>
                </article>
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-[var(--color-text-muted)]">
            {adaptersSection.footnote}
          </p>
        </div>
      </section>

      {/* ═══ HOW IT GROWS ═══ */}
      <CapabilityGrid items={capabilities} sectionClassName="px-4 pb-4" />

      {/* ═══ OWNERSHIP TIE-IN ═══ */}
      <TieInSection
        eyebrow={tieIn.eyebrow}
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={<IconList items={tieIn.checklistItems} />}
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <CodePanel
            comment="// how a file lands in your storage"
            success="✓ your accounts. your bytes. no zcrypt-sold quota."
          >
            <div>
              <span className="text-cyan-600/80 dark:text-cyan-400/80">1</span> encrypt
              on device — AES-256-GCM
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">2</span> split
              into chunks
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">3</span> disguise
              as <span className="text-[var(--color-text-secondary)]">build-cache-*.bin</span>
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">4</span> upload to
              a repo you own
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">5</span> repo near
              limit? <span className="text-amber-500">rotate →</span> fresh repo
            </div>
          </CodePanel>
        }
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection heading={cta.heading} subtext={cta.subtext} />
        </div>
      </section>
    </>
  );
}
