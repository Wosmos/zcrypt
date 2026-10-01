import "@/components/marketing/landing/base.css";
import "./comparison.css";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Shield } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, MarketingCard, cardSurfaceSm } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { Section } from "@/components/marketing/section-reveal";
import { cn } from "@/lib/utils";
import { ComparisonTable, type ComparisonRow } from "./comparison-table";

type Icon = ComponentType<{ className?: string }>;

interface Head {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
}

export interface VsData {
  otherName: string;
  hero: {
    eyebrow: string;
    title: string;
    lede: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  respectNote?: ReactNode;
  pillarsHead: Head;
  pillars: { Icon: Icon; title: string; desc: ReactNode }[];
  table: Head & { footnote: ReactNode; rows: ComparisonRow[] };
  whenBetter: Head & { paragraphs: ReactNode[] };
  related: { href: string; Icon: Icon; title: string; desc: ReactNode }[];
  breadcrumb: { name: string; url: string }[];
}

export function ComparisonPage({
  otherName,
  hero,
  respectNote,
  pillarsHead,
  pillars,
  table,
  whenBetter,
  related,
  breadcrumb,
}: VsData) {
  return (
    <div className="pv2">
      <BreadcrumbJsonLd items={breadcrumb} />

      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        lede={hero.lede}
        actions={
          <>
            <PillLink href="/register">Start free</PillLink>
            <PillLink href={hero.secondaryHref} variant="secondary">
              {hero.secondaryLabel}
            </PillLink>
          </>
        }
        note="No card. No trial. There's nothing to upgrade to."
      >
        {respectNote ? (
          <div className={cn(cardSurfaceSm, "vs-note")}>
            <IconWell icon={Shield} />
            <p className="pv2-body">{respectNote}</p>
          </div>
        ) : null}
      </PageHero>

      <section className="pv2-sec vs-sec-top" aria-labelledby="h-vs-why">
        <div className="pv2-wrap">
          <SectionHead id="h-vs-why" {...pillarsHead} />
          <ul className="vs-grid">
            {pillars.map((p) => (
              <li key={p.title}>
                <Section as="div" className="h-full">
                  <MarketingCard as="div" className="vs-card">
                    <IconWell icon={p.Icon} />
                    <h3 className="pv2-h3">{p.title}</h3>
                    <p className="pv2-body">{p.desc}</p>
                  </MarketingCard>
                </Section>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pv2-sec" aria-labelledby="h-vs-table">
        <div className="pv2-wrap">
          <SectionHead
            id="h-vs-table"
            eyebrow={table.eyebrow}
            title={table.title}
            lede={table.lede}
          />
          <ComparisonTable otherName={otherName} rows={table.rows} />
          <p className="vs-foot">{table.footnote}</p>
        </div>
      </section>

      <section className="pv2-sec" aria-labelledby="h-vs-honest">
        <div className="pv2-wrap vs-prose-wrap">
          <SectionHead
            id="h-vs-honest"
            align="left"
            eyebrow={whenBetter.eyebrow}
            title={whenBetter.title}
            lede={whenBetter.lede}
          />
          <div className="vs-prose">
            {whenBetter.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="pv2-sec vs-sec-tight" aria-labelledby="h-vs-more">
        <div className="pv2-wrap">
          <SectionHead id="h-vs-more" eyebrow="Go deeper" title="Read the details" />
          <ul className="vs-grid">
            {related.map(({ href, Icon, title, desc }) => (
              <li key={href}>
                <Link href={href} className={cn(cardSurfaceSm, "pv2-card-link vs-card vs-link")}>
                  <IconWell icon={Icon} />
                  <h3 className="pv2-h3 vs-link-title">
                    {title}
                    <ArrowRight className="vs-link-arrow" aria-hidden="true" />
                  </h3>
                  <p className="pv2-body">{desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ClosingCta id="start" label="Start free" className="pb-12" />
    </div>
  );
}
