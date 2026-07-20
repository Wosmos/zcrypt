import type { Metadata } from "next";
import { Link2, Lock, Clock, Download, XCircle, Zap, FileText } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { sharing } from "../_data/sharing";

export const metadata: Metadata = {
  title: "Encrypted File Sharing — Keys That Stay in the Link",
  description:
    "Share any file with a link whose decryption key lives only in the URL fragment — it never reaches the server. Add a password, an expiry, or a download limit, and revoke anytime. Recipients need no account and decrypt entirely in their browser.",
  keywords: [
    "encrypted file sharing",
    "secure share link",
    "zero-knowledge sharing",
    "password protected share link",
    "expiring download link",
    "burn after reading",
    "anonymous file send",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/sharing" },
  openGraph: {
    title: "Encrypted File Sharing | zcrypt",
    description:
      "Per-file share links where the decryption key lives only in the URL fragment, never on the server. Optional password, expiry, and download limits. Revoke anytime.",
    url: "https://zcrypt.cloud/features/sharing",
    type: "website",
  },
};

export default function SharingPage() {
  const { hero, capabilitiesSection, capabilities, tieIn, moreWaysSection, moreWays, related, cta } = sharing;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Sharing", url: "https://zcrypt.cloud/features/sharing" },
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
        {/* Share-link mock */}
        <MockWindowFrame
          maxWidth="max-w-3xl"
          contentClassName="p-4 sm:p-5"
          label="Share link"
          labelIcon={Link2}
          badgeIcon={Lock}
          badgeLabel="End-to-end"
        >
          {/* the url, with the fragment highlighted */}
          <div className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] p-3 font-mono text-[11px] leading-relaxed break-all dark:bg-white/[0.02]">
            <span className="text-[var(--color-text-muted)]">
              https://zcrypt.cloud/s/
            </span>
            <span className="text-[var(--color-text-secondary)]">3kQ9pX2v</span>
            <span className="text-amber-600 dark:text-amber-400">
              #key=8f4a…d20e
            </span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
              <span className="font-mono">/s/3kQ9pX2v</span>
              <span>— sent to the server</span>
            </div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-mono">#key=…</span>
              <span>— stays in the browser</span>
            </div>
          </div>

          {/* link controls */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { Icon: Lock, label: "Password", value: "On" },
              { Icon: Clock, label: "Expires", value: "7 days" },
              { Icon: Download, label: "Downloads", value: "5 left" },
              { Icon: XCircle, label: "Revoke", value: "Anytime" },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
              >
                <c.Icon className="h-4 w-4 text-cyan-500" />
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {c.label}
                </div>
                <div className="text-xs font-medium">{c.value}</div>
              </div>
            ))}
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading={capabilitiesSection.heading}
        subheading={capabilitiesSection.subheading}
        items={capabilities}
      />

      {/* ═══ WHY THE FRAGMENT MATTERS ═══ */}
      <TieInSection
        sectionClassName="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20"
        eyebrow={tieIn.eyebrow}
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={<IconList items={tieIn.checklistItems} />}
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <CodePanel
            comment="// what the server sees on open"
            success="✓ no key on the wire. no plaintext on the server."
          >
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">GET</span>{" "}
              /s/3kQ9pX2v
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">returns</span>{" "}
              ciphertext blob — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">#key=…</span>{" "}
              <span className="text-amber-500">not in request</span>
            </div>
            <div className="mt-1.5">
              decrypt happens in:{" "}
              <span className="text-emerald-500">the browser</span>
            </div>
          </CodePanel>
        }
      />

      {/* ═══ MORE WAYS TO SEND ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {moreWaysSection.heading}
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {moreWaysSection.subheading}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <article className="card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">{moreWays[0].title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {moreWays[0].desc}
              </p>
            </article>
            <article className="card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">{moreWays[1].title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {moreWays[1].desc}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection heading={cta.heading} subtext={cta.subtext} />
        </div>
      </section>
    </>
  );
}
