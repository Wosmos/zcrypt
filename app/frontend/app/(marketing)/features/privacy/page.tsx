import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, Shield, Lock, Clock, Bell, Mail, AlertTriangle, Check, X } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { privacy } from "../_data/privacy";

export const metadata: Metadata = {
  title: "Privacy Tools — Decoy Profile & Dead Man's Switch",
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
  alternates: { canonical: "https://zcrypt.cloud/features/privacy" },
  openGraph: {
    title: "Privacy Tools — Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "A decoy vault for coercion, a dead man's switch that alerts a trusted contact, plus snapshots and shared vaults in beta — all on a zero-knowledge core.",
    url: "https://zcrypt.cloud/features/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Tools — Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "Plausible deniability and a dead man's switch, built on top of zero-knowledge encryption. Honest about what each one does — and doesn't.",
  },
};

export default function PrivacyToolsPage() {
  const { hero, decoy, deadMansSwitch, betaSection, betaTools, zeroKnowledgeTieIn, related, cta } = privacy;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/privacy" },
          { name: "Privacy Tools", url: "https://zcrypt.cloud/features/privacy" },
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
        trustLine={hero.trustLine}
      />

      {/* ═══ DECOY PROFILE ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {decoy.eyebrow}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {decoy.heading}
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              {decoy.body}
            </p>
            <ul className="mt-6 space-y-2.5">
              {decoy.points.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                >
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/decoy-profile"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How decoy profiles work
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Two-login mock */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
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
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-5">
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
        </div>
      </section>

      {/* ═══ DEAD MAN'S SWITCH ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-16">
        <div className="mx-auto grid max-w-5xl items-start gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {deadMansSwitch.eyebrow}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {deadMansSwitch.heading}
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              {deadMansSwitch.body}
            </p>

            {/* Check-in timeline */}
            <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
                <Clock className="h-3.5 w-3.5 text-cyan-500" />
                Check-in window
                <span className="ml-auto font-mono text-[var(--color-text-muted)]">
                  7&ndash;365 days
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
          </div>

          {/* Does / does-not honesty card */}
          <div className="space-y-4">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Mail className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold">What it does</h3>
              </div>
              <ul className="space-y-2.5">
                {deadMansSwitch.does.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={3} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card border-amber-500/30 bg-amber-500/[0.04] p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold">What it doesn&apos;t do</h3>
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
        </div>
      </section>

      {/* ═══ IN BETA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              In beta
            </span>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {betaSection.heading}
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {betaSection.subheading}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {betaTools.map(({ Icon, title, desc, caveat, href }) => (
              <article key={title} className="card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Beta
                  </span>
                </div>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                  <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {caveat}
                  </p>
                </div>
                <Link
                  href={href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
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
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {zeroKnowledgeTieIn.heading}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            {zeroKnowledgeTieIn.body}
          </p>
          <Link
            href="/docs/how-it-works"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
          >
            How the encryption works
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

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
