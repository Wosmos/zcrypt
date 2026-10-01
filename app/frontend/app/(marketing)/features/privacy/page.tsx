import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Shield,
  Lock,
  Clock,
  Bell,
  Mail,
  AlertTriangle,
  Check,
  X,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { IconWell, cardSurface, cardSurfaceSm } from "@/components/marketing/ui/card";
import { cn } from "@/lib/utils";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { privacy } from "../_data/privacy";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Tools. Decoy Profile & Dead Man's Switch",
  description:
    "zcrypt's privacy toolkit: a decoy profile that opens a fake vault under coercion, and a dead man's switch that emails a trusted contact if you stop checking in. Plus snapshots and shared vaults, in beta. All built on zero-knowledge encryption.",
  keywords: [
    "decoy profile",
    "plausible deniability",
    "duress password",
    "dead man's switch",
    "encrypted vault privacy",
    "coercion protection",
    "zero-knowledge privacy tools",
    "file integrity snapshots",
    "shared encrypted vaults",
    "border crossing privacy",
  ],
  alternates: { canonical: `${SITE_URL}/features/privacy` },
  openGraph: {
    title: "Privacy Tools. Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "A decoy vault for coercion, a dead man's switch that alerts a trusted contact, plus snapshots and shared vaults in beta: all on a zero-knowledge core.",
    url: `${SITE_URL}/features/privacy`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Tools. Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "Plausible deniability and a dead man's switch, built on top of zero-knowledge encryption. Honest about what each one does, and doesn't.",
  },
};

export default function PrivacyToolsPage() {
  const { hero, decoy, deadMansSwitch, betaSection, betaTools, zeroKnowledgeTieIn, related, cta } =
    privacy;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Features", url: `${SITE_URL}/features/privacy` },
          { name: "Privacy Tools", url: `${SITE_URL}/features/privacy` },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
        trustLine={hero.trustLine}
      />

      {/* ═══ DECOY PROFILE ═══ */}
      <TieInSection
        eyebrow={decoy.eyebrow}
        heading={decoy.heading}
        body={decoy.body}
        checklist={
          <IconList
            items={decoy.points}
            itemClassName="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
            iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--pv2-accent-ink)]"
          />
        }
        linkLabel="How decoy profiles work"
        linkHref="/docs/decoy-profile"
        panel={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={cn(cardSurfaceSm, "p-5")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)]">
                  <Eye className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  Decoy password
                </span>
              </div>
              <div className="space-y-1.5">
                {["budget-2024.xlsx", "cat-photos", "recipes.txt"].map((f) => (
                  <div
                    key={f}
                    className="truncate rounded-lg bg-black/[0.02] px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-text-secondary)] dark:bg-white/[0.02]"
                  >
                    {f}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Looks ordinary
              </p>
            </div>
            <div className={cn(cardSurfaceSm, "p-5")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Lock className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                  Real password
                </span>
              </div>
              <div className="space-y-1.5">
                {["source·sealed", "ledger·sealed", "keys·sealed"].map((f) => (
                  <div
                    key={f}
                    className="truncate rounded-lg bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[11px] text-cyan-700 dark:text-cyan-300"
                  >
                    {f}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-600/80 dark:text-cyan-400/80">
                Never revealed
              </p>
            </div>
          </div>
        }
      />

      {/* ═══ DEAD MAN'S SWITCH ═══ */}
      <TieInSection
        join
        eyebrow={deadMansSwitch.eyebrow}
        heading={deadMansSwitch.heading}
        body={deadMansSwitch.body}
        checklist={
          <div className={cn(cardSurfaceSm, "mt-7 p-5")}>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
              <Clock className="h-3.5 w-3.5 text-cyan-500" />
              Check-in window
              <span className="ml-auto font-mono text-[var(--color-text-muted)]">
                7 to 365 days
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--color-text-muted)]">
              <span>last login resets it</span>
              <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                <Bell className="h-3 w-3" /> contact notified
              </span>
            </div>
          </div>
        }
        panel={
          <div className="space-y-4">
            <div className={cn(cardSurfaceSm, "p-6")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Mail className="h-4 w-4" />
                </span>
                <h3 className="pv2-h3 text-base">What it does</h3>
              </div>
              <ul className="space-y-2.5">
                {deadMansSwitch.does.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
                      strokeWidth={3}
                    />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn(cardSurfaceSm, "p-6")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <h3 className="pv2-h3 text-base">What it doesn&apos;t do</h3>
              </div>
              <ul className="space-y-2.5">
                {deadMansSwitch.doesNot.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
                {deadMansSwitch.doesNotFootnote}
              </p>
            </div>
          </div>
        }
      />

      {/* ═══ IN BETA ═══ */}
      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-beta">
        <div className="pv2-wrap">
          <SectionHead
            id="h-beta"
            eyebrow="In beta"
            title={betaSection.heading}
            lede={betaSection.subheading}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {betaTools.map(({ Icon, title, desc, caveat, href }) => (
              <article key={title} className={cn(cardSurfaceSm, "p-6 sm:p-7")}>
                <div className="mb-5 flex items-center justify-between">
                  <IconWell icon={Icon} />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Beta
                  </span>
                </div>
                <h3 className="pv2-h3 text-lg">{title}</h3>
                <p className="pv2-body mt-2">{desc}</p>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                  <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {caveat}
                  </p>
                </div>
                <Link
                  href={href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pv2-accent-ink)] transition-all hover:gap-2.5"
                >
                  Read the docs
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ZERO-KNOWLEDGE TIE-IN ═══ */}
      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-core">
        <div className="pv2-wrap pv2-wrap-narrow">
          <div className={cn(cardSurface, "p-8 text-center sm:p-12")}>
            <IconWell icon={Shield} className="mx-auto mb-5" />
            <SectionHead
              id="h-core"
              title={zeroKnowledgeTieIn.heading}
              lede={zeroKnowledgeTieIn.body}
              className="pv2-head-flush"
            />
            <Link
              href="/docs/how-it-works"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pv2-accent-ink)] transition-all hover:gap-2.5"
            >
              How the encryption works
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <RelatedLinks items={related} />
      <ClosingCta title={cta.heading} subtext={cta.subtext} />
    </>
  );
}
