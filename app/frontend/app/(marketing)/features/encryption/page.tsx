import type { Metadata } from "next";
import { Lock, Shield, Cpu, Server, Eye, X } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid, StepCards } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { IconWell, cardSurface, cardSurfaceSm } from "@/components/marketing/ui/card";
import { cn } from "@/lib/utils";
import { encryption } from "../_data/encryption";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Zero-Knowledge Encryption. AES-256-GCM, Encrypted on Your Device",
  description:
    "Your files are encrypted on your own device with AES-256-GCM before they ever leave. Your key is derived from your passphrase with PBKDF2-SHA256 (600,000 iterations) and never transmitted. The server only ever sees ciphertext, no keys, no plaintext, not even your folder names.",
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
  alternates: { canonical: `${SITE_URL}/features/encryption` },
  openGraph: {
    title: "Zero-Knowledge Encryption. Encrypted on Your Device | zcrypt",
    description:
      "AES-256-GCM, on your device, before anything leaves. Your passphrase never travels. The server only ever holds ciphertext, no keys, no plaintext, no folder names.",
    url: `${SITE_URL}/features/encryption`,
    type: "website",
  },
};

export default function EncryptionPage() {
  const { hero, boundary, guarantees, pipelineSection, pipeline, tieIn, related, cta } = encryption;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Features", url: `${SITE_URL}/features/encrypted-drive` },
          { name: "Encryption", url: `${SITE_URL}/features/encryption` },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      >
        {/* Encryption boundary diagram */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            {/* trusted device */}
            <div className={cn(cardSurfaceSm, "p-6 text-left")}>
              <div className="mb-5 flex items-center gap-3">
                <IconWell icon={Cpu} />
                <div>
                  <div className="pv2-h3 text-base">{boundary.device.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--pv2-accent-ink)]">
                    Trusted zone
                  </div>
                </div>
              </div>
              <IconList
                items={boundary.device.items}
                iconClassName="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--pv2-accent-ink)]"
                itemClassName="flex items-start gap-2"
                className="space-y-2 text-[13px] text-[var(--color-text-secondary)]"
              />
            </div>

            {/* boundary */}
            <div className="flex flex-row items-center justify-center gap-2 md:flex-col">
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <Lock className="h-3 w-3 text-[var(--pv2-accent-ink)]" /> Encryption boundary
              </span>
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
            </div>

            {/* server */}
            <div className={cn(cardSurfaceSm, "p-6 text-left")}>
              <div className="mb-5 flex items-center gap-3">
                <IconWell icon={Server} />
                <div>
                  <div className="pv2-h3 text-base">{boundary.server.title}</div>
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
                className="space-y-2 text-[13px] text-[var(--color-text-secondary)]"
              />
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ GUARANTEES ═══ */}
      <CapabilityGrid
        eyebrow="The guarantees"
        heading="What we can and can't see"
        subheading="Not a privacy policy promise. A cryptographic one: enforced by where the keys live and what code runs where."
        items={guarantees}
      />

      {/* ═══ THE PIPELINE ═══ */}
      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-pipeline">
        <div className="pv2-wrap">
          <SectionHead
            id="h-pipeline"
            eyebrow={pipelineSection.eyebrow}
            title={pipelineSection.heading}
            lede={pipelineSection.subheading}
          />
          <StepCards steps={pipeline} />

          <div className="mt-10">
            <CodePanel
              comment="// what actually lands on the server"
              success="✓ no passphrase. no derived key. no plaintext. no readable names."
            >
              <div className="break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">wrapped_key</span>{" "}
                8e30dd·91ac0c·77ae3f·b8d40e, sealed under your passphrase
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">name</span>{" "}
                9f2a1c·b8d40e·7c5b13·f0e2a9, sealed
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[0]</span>{" "}
                a4f9c1·0c77ae·3f5b2a·4f9c1e. AES-256-GCM
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[1]</span>{" "}
                4d1b6c·77ae3f·5b2a4f·9c1e0c. AES-256-GCM
              </div>
            </CodePanel>
          </div>
        </div>
      </section>

      {/* ═══ THE TRADE-OFF (HONESTY) ═══ */}
      <TieInSection
        join
        eyebrow="The honest trade-off"
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={tieIn.checklist}
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <div className={cn(cardSurface, "p-7 sm:p-8")}>
            <IconWell icon={Shield} className="mb-5" />
            <IconList
              items={tieIn.panelIntro}
              icon={Eye}
              iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--pv2-accent-ink)]"
              iconStrokeWidth={1.5}
              itemClassName="flex items-start gap-2.5"
              className="space-y-3 text-sm text-[var(--color-text-secondary)]"
            />
          </div>
        }
      />

      {/* ═══ RELATED + CTA ═══ */}
      <RelatedLinks items={related} />
      <ClosingCta title={cta.heading} subtext={cta.subtext} />
    </>
  );
}
