import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin, ShieldCheck } from "@/lib/icons";
import { PullQuote } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { WOSMO, WOSMO_SOCIALS, WosmoWordmark } from "@/components/marketing/wosmo";
import { PersonJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { about } from "./_data/about";

// Server Component (statically generated) — metadata lives here, and the only
// client parts are the <Section> scroll-reveal islands from prose.tsx.
export const metadata: Metadata = {
  title: "About — The person behind zcrypt",
  description:
    "zcrypt is built by Wasif Malik (Wosmo), a full-stack engineer from Karachi. A privacy tool should tell you who's behind it — so here I am. My story, the other things I've built, and how to reach me.",
  alternates: {
    canonical: "https://zcrypt.cloud/about",
  },
  openGraph: {
    title: "About — The person behind zcrypt",
    description:
      "zcrypt isn't a faceless company. It's built by one engineer, in the open. Meet Wasif Malik (Wosmo).",
    url: "https://zcrypt.cloud/about",
  },
};

export default function AboutPage() {
  return (
    <div className="pt-28 pb-20">
      <PersonJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "About", url: "https://zcrypt.cloud/about" },
        ]}
      />
      <article className="mx-auto max-w-3xl px-4">
        {/* ─── Hero ─────────────────────────────────────────── */}
        <Section>
          <WosmoWordmark className="h-8 w-auto text-[var(--color-text)]" />

          <p className="mt-8 mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            {about.hero.eyebrow}
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {about.hero.headlineTop}
            <br />
            <span className="text-[var(--color-text-secondary)]">
              {about.hero.headlineSecondary}
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {about.hero.subtext}
          </p>

          {/* Identity chips */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
              <MapPin className="h-3.5 w-3.5 text-cyan-500" />
              {WOSMO.location}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
              {WOSMO.role}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-1.5 text-[13px] font-medium text-cyan-600 dark:text-cyan-400">
              Building in the open
            </span>
          </div>

          {/* Primary links */}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/25 transition-shadow hover:shadow-xl hover:shadow-cyan-500/40"
            >
              {about.hero.primaryLabel}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href={WOSMO.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-cyan-500/40"
            >
              {about.hero.secondaryLabel}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-12 h-px bg-[var(--color-border)]" />
        </Section>

        {/* ─── Not anonymous (the trust angle) ──────────────── */}
        <Section className="mt-12">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
            <div className="mb-3 inline-flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {about.trust.eyebrow}
              </span>
            </div>
            <p className="text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
              {about.trust.body}
            </p>
          </div>
        </Section>

        {/* ─── The origin story ─────────────────────────────── */}
        <Section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {about.origin.heading}
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.origin.paragraphsBeforeQuote.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <PullQuote>{about.origin.pullQuote}</PullQuote>
          <div className="space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.origin.paragraphsAfterQuote.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <Link
            href="/philosophy"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
          >
            {about.origin.philosophyLinkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Section>

        {/* ─── Other things I've built ──────────────────────── */}
        <Section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {about.projects.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.projects.intro}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {about.projects.items.map((p) => (
              <a
                key={p.name}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group card p-5 transition-colors hover:border-cyan-500/40"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold tracking-tight">
                    {p.name}
                  </h3>
                  <ArrowUpRight className="h-4 w-4 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p.blurb}
                </p>
                <p className="mt-3 font-mono text-[11px] tracking-tight text-[var(--color-text-muted)]">
                  {p.stack}
                </p>
              </a>
            ))}
          </div>

          <div className="mt-8">
            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              {about.projects.portfolioLinkLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </Section>

        {/* ─── The stack ────────────────────────────────────── */}
        <Section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {about.stack.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.stack.intro}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {about.stack.items.map((tech) => (
              <span
                key={tech}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)]"
              >
                {tech}
              </span>
            ))}
          </div>
        </Section>

        {/* ─── Contact / CTA ────────────────────────────────── */}
        <Section className="mt-20 border-t border-[var(--color-border)] pt-12">
          <div className="rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-1)] to-[var(--color-surface)] p-8 text-center sm:p-10">
            <WosmoWordmark className="mx-auto h-8 w-auto text-[var(--color-text)]" />
            <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
              {about.cta.heading}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--color-text-secondary)]">
              {about.cta.body}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              {WOSMO_SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-cyan-500/40 hover:text-[var(--color-text)]"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            </div>
          </div>
        </Section>
      </article>
    </div>
  );
}
