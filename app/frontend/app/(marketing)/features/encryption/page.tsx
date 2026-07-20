import type { Metadata } from "next";
import { Lock, Shield, Cpu, Server, Eye, X } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { encryption } from "../_data/encryption";

export const metadata: Metadata = {
  title: "Zero-Knowledge Encryption — AES-256-GCM, Encrypted on Your Device",
  description:
    "Your files are encrypted on your own device with AES-256-GCM before they ever leave. Your key is derived from your passphrase with PBKDF2-SHA256 (600,000 iterations) and never transmitted. The server only ever sees ciphertext — no keys, no plaintext, not even your folder names.",
  keywords: [
    "zero-knowledge encryption",
    "client-side encryption",
    "AES-256-GCM",
    "PBKDF2",
    "end-to-end encrypted storage",
    "envelope encryption",
    "encrypted cloud storage",
    "private cloud",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/encryption" },
  openGraph: {
    title: "Zero-Knowledge Encryption — Encrypted on Your Device | zcrypt",
    description:
      "AES-256-GCM, on your device, before anything leaves. Your passphrase never travels. The server only ever holds ciphertext — no keys, no plaintext, no folder names.",
    url: "https://zcrypt.cloud/features/encryption",
    type: "website",
  },
};

export default function EncryptionPage() {
  const { hero, boundary, guarantees, pipelineSection, pipeline, tieIn, related, cta } = encryption;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Encryption", url: "https://zcrypt.cloud/features/encryption" },
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
        {/* Encryption boundary diagram */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            {/* trusted device */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Cpu className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold">{boundary.device.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    Trusted zone
                  </div>
                </div>
              </div>
              <IconList
                items={boundary.device.items}
                iconClassName="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan-500"
                itemClassName="flex items-start gap-2"
                className="space-y-2 text-xs text-[var(--color-text-secondary)]"
              />
            </div>

            {/* boundary */}
            <div className="flex flex-row items-center justify-center gap-2 md:flex-col">
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <Lock className="h-3 w-3 text-cyan-500" /> Encryption boundary
              </span>
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
            </div>

            {/* server */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-[var(--color-text-muted)] dark:bg-white/[0.04]">
                  <Server className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold">{boundary.server.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Ciphertext only
                  </div>
                </div>
              </div>
              <IconList
                items={boundary.server.items}
                icon={X}
                iconClassName="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-500/70"
                itemClassName="flex items-start gap-2"
                className="space-y-2 text-xs text-[var(--color-text-secondary)]"
              />
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ GUARANTEES ═══ */}
      <CapabilityGrid
        heading="What zero-knowledge actually means"
        subheading="Not a privacy policy promise. A cryptographic one — enforced by where the keys live and what code runs where."
        items={guarantees}
      />

      {/* ═══ THE PIPELINE ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {pipelineSection.eyebrow}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {pipelineSection.heading}
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {pipelineSection.subheading}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((p) => (
              <div key={p.step} className="card relative p-6">
                <div className="font-heading text-3xl font-bold text-cyan-500/20">
                  {p.step}
                </div>
                <h3 className="mt-3 text-sm font-bold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>

          {/* what the server stores */}
          <div className="mt-10">
            <CodePanel
              comment="// what actually lands on the server"
              success="✓ no passphrase. no derived key. no plaintext. no readable names."
            >
              <div className="break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">wrapped_key</span> 8e30dd·91ac0c·77ae3f·b8d40e — sealed under your passphrase
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">name</span> 9f2a1c·b8d40e·7c5b13·f0e2a9 — sealed
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[0]</span> a4f9c1·0c77ae·3f5b2a·4f9c1e — AES-256-GCM
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[1]</span> 4d1b6c·77ae3f·5b2a4f·9c1e0c — AES-256-GCM
              </div>
            </CodePanel>
          </div>
        </div>
      </section>

      {/* ═══ THE TRADE-OFF (HONESTY) ═══ */}
      <TieInSection
        surface={false}
        eyebrow="The honest trade-off"
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={tieIn.checklist}
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <div className="card p-6">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Shield className="h-5 w-5" />
            </div>
            <IconList
              items={tieIn.panelIntro}
              icon={Eye}
              iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500"
              iconStrokeWidth={1.5}
              itemClassName="flex items-start gap-2.5"
              className="space-y-3 text-sm text-[var(--color-text-secondary)]"
            />
          </div>
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
