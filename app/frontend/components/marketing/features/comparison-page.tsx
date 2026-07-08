import type { ReactNode } from "react";
import { Shield } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "./feature-hero";
import { ComparisonTable, type ComparisonRow } from "./comparison-table";
import { RelatedLinks, type RelatedLinkItem } from "./related-links";
import { CtaSection } from "./cta-section";
import type { CapabilityItem } from "./capability-grid";

interface WhenBetterProps {
  /** Uppercase eyebrow. Default "The honest part". */
  eyebrow?: ReactNode;
  /** Section heading, e.g. "When Dropbox is the better choice". */
  heading: ReactNode;
  /** Prose paragraphs (each already-authored JSX with <strong> etc.). */
  paragraphs: ReactNode[];
}

export interface ComparisonPageProps {
  otherName: ReactNode;

  hero: {
    eyebrow: string;
    headlineTop: ReactNode;
    headlineGradient: ReactNode;
    subtext: ReactNode;
    secondaryLabel: ReactNode;
    secondaryHref: string;
    /** CTA label. Defaults to the vs-page "Create your vault — free". */
    ctaLabel?: ReactNode;
  };

  /** Optional "credit where due" note card (proton only). */
  respectNote?: ReactNode;

  pillars: CapabilityItem[];
  /** proton renders a heading over the pillars; the others don't. */
  pillarsHeading?: ReactNode;
  pillarsSubheading?: ReactNode;

  table: {
    rows: ComparisonRow[];
    heading: ReactNode;
    subheading: ReactNode;
    footnote: ReactNode;
  };

  whenBetter: WhenBetterProps;

  /** "Go deeper" 2-up related cards. */
  related: RelatedLinkItem[];
  closing: { heading: ReactNode; subtext: ReactNode };

  /** JSON-LD breadcrumb items for this page. */
  breadcrumb: { name: string; url: string }[];
}

/**
 * Full-page scaffold for the vs/* comparison pages. Composes the shared
 * FeatureHero, an inline 4-pillar grid (title styling diverges from
 * CapabilityGrid, so it's rendered here), the ComparisonTable, an "honest part"
 * prose block, and the closing RelatedLinks + CtaSection. Proton-only extras —
 * a respect-note card and a heading above the pillars — are optional slots.
 * Also emits the BreadcrumbJsonLd since all three vs pages need identical
 * structured data.
 */
export function ComparisonPage({
  otherName,
  hero,
  respectNote,
  pillars,
  pillarsHeading,
  pillarsSubheading,
  table,
  whenBetter,
  related,
  closing,
  breadcrumb,
}: ComparisonPageProps) {
  const hasPillarsHeading = Boolean(pillarsHeading || pillarsSubheading);
  const pillarsSectionClassName = hasPillarsHeading ? "px-4 py-12" : "px-4 py-16";

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumb} />

      <FeatureHero
        eyebrow={hero.eyebrow}
        headlineTop={hero.headlineTop}
        headlineGradient={hero.headlineGradient}
        subtext={hero.subtext}
        ctaLabel={hero.ctaLabel ?? "Create your vault — free"}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      />

      {respectNote && (
        <section className="px-4 pb-4">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-500" />
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {respectNote}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className={pillarsSectionClassName}>
        <div className="mx-auto max-w-5xl">
          {hasPillarsHeading && (
            <div className="mx-auto mb-10 max-w-2xl text-center">
              {pillarsHeading && (
                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                  {pillarsHeading}
                </h2>
              )}
              {pillarsSubheading && (
                <p className="mt-3 text-[var(--color-text-secondary)]">{pillarsSubheading}</p>
              )}
            </div>
          )}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 list-none">
            {pillars.map((pillar, i) => {
              const { Icon } = pillar;
              // proton (the page that passes a pillars heading) demoted these
              // titles to <h3> under its section <h2>; dropbox/google-drive have
              // no section heading so their pillar titles stay <h2>.
              const PillarTitle = hasPillarsHeading ? "h3" : "h2";
              return (
                <li key={i}>
                  <article className="card p-6 transition-colors hover:border-cyan-500/30">
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <PillarTitle className="font-heading text-base font-bold">{pillar.title}</PillarTitle>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {pillar.desc}
                    </p>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <ComparisonTable
        otherName={otherName}
        rows={table.rows}
        heading={table.heading}
        subheading={table.subheading}
        footnote={table.footnote}
      />

      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            {whenBetter.eyebrow ?? "The honest part"}
          </p>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {whenBetter.heading}
          </h2>
          <div className="mt-6 space-y-5 leading-relaxed text-[var(--color-text-secondary)]">
            {whenBetter.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks
            heading="Go deeper"
            gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
            items={related}
          />
          <CtaSection heading={closing.heading} subtext={closing.subtext} />
        </div>
      </section>
    </>
  );
}
