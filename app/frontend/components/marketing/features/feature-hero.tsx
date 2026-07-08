import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "@/lib/icons";
import { PrimaryCta } from "./primary-cta";

export interface FeatureHeroProps {
  /** Uppercase eyebrow, e.g. "Zero-knowledge encryption". */
  eyebrow: string;
  /**
   * Headline first line. Rendered as plain text above the gradient line.
   */
  headlineTop: ReactNode;
  /**
   * Headline second line. Rendered inside the italic gradient <span>.
   */
  headlineGradient: ReactNode;
  /** Lead paragraph under the headline. */
  subtext: ReactNode;
  /** Primary CTA label. Default "Create your vault". */
  ctaLabel?: ReactNode;
  /** Primary CTA href. Default "/register". */
  ctaHref?: string;
  /** Secondary ghost link label, e.g. "Read the docs". */
  secondaryLabel: ReactNode;
  /** Secondary ghost link href, e.g. "/docs/zero-knowledge". */
  secondaryHref: string;
  /** Optional trust line rendered below the CTA row (privacy page only). */
  trustLine?: ReactNode;
  /**
   * Optional page-specific mock/diagram rendered after the hero copy, still
   * inside the hero <section> (outside the centered text column).
   */
  children?: ReactNode;
}

/**
 * The centered radial-blur marketing hero ("Hero-A") shared by every
 * features/* and vs/* page: a single cyan blur backdrop, an uppercase eyebrow,
 * a two-line gradient headline, lead subtext, and a primary + secondary CTA
 * row. Page-specific mocks/diagrams may be passed as children and render after
 * the text column. Distinct from the grid-pattern MarketingHero used by
 * download/tui.
 */
export function FeatureHero({
  eyebrow,
  headlineTop,
  headlineGradient,
  subtext,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  trustLine,
  children,
}: FeatureHeroProps) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
          {eyebrow}
        </p>

        <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          {headlineTop}
          <br />
          <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
            {headlineGradient}
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
          {subtext}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <PrimaryCta label={ctaLabel} href={ctaHref} />
          <Link
            href={secondaryHref}
            className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
          >
            {secondaryLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {trustLine && (
          <p className="mx-auto mt-6 inline-flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {trustLine}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}
