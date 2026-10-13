import "@/components/marketing/landing/base.css";
import "./comparison.css";
import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, Shield } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, MarketingCard, cardSurfaceSm } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { Section } from "@/components/marketing/section-reveal";
import { T } from "@/components/i18n/t";
import { cn } from "@/lib/utils";
import { ComparisonTable, type ComparisonRow } from "./comparison-table";

type Icon = ComponentType<{ className?: string }>;

export interface VsData {
  ns: string;
  otherName: string;
  owner: string;
  heroSecondaryHref: string;
  respectNote?: boolean;
  pillarsHeadLede?: boolean;
  pillars: { Icon: Icon; id: string }[];
  rows: ComparisonRow[];
  paragraphs: number;
  related: { href: string; Icon: Icon; id: string }[];
  breadcrumb: { name: string; url: string }[];
}

const STRONG = "[&_strong]:text-[var(--color-text)]";

export function ComparisonPage({
  ns,
  otherName,
  owner,
  heroSecondaryHref,
  respectNote,
  pillarsHeadLede,
  pillars,
  rows,
  paragraphs,
  related,
  breadcrumb,
}: VsData) {
  const k = (path: string) => `site.vs.${ns}.${path}`;
  const c = (path: string) => `site.vs.common.${path}`;
  const name = { name: otherName };
  return (
    <div className="pv2">
      <BreadcrumbJsonLd items={breadcrumb} />

      <PageHero
        eyebrow={<T k={c("heroEyebrow")} values={name} />}
        title={<T k={k("hero.title")} />}
        lede={<T k={k("hero.lede")} />}
        actions={
          <>
            <PillLink href="/register">
              <T k={c("startFree")} />
            </PillLink>
            <PillLink href={heroSecondaryHref} variant="secondary">
              <T k={k("hero.secondary")} />
            </PillLink>
          </>
        }
        note={<T k={c("heroNote")} />}
      >
        {respectNote ? (
          <div className={cn(cardSurfaceSm, "vs-note")}>
            <IconWell icon={Shield} />
            <p className={cn("pv2-body", STRONG)}>
              <T k={k("respectNote")} />
            </p>
          </div>
        ) : null}
      </PageHero>

      <section className="pv2-sec vs-sec-top" aria-labelledby="h-vs-why">
        <div className="pv2-wrap">
          <SectionHead
            id="h-vs-why"
            eyebrow={<T k={k("pillarsHead.eyebrow")} />}
            title={<T k={k("pillarsHead.title")} />}
            lede={pillarsHeadLede ? <T k={k("pillarsHead.lede")} /> : undefined}
          />
          <ul className="vs-grid">
            {pillars.map((p) => (
              <li key={p.id}>
                <Section as="div" className="h-full">
                  <MarketingCard as="div" className="vs-card">
                    <IconWell icon={p.Icon} />
                    <h3 className="pv2-h3">
                      <T k={k(`pillars.${p.id}.title`)} />
                    </h3>
                    <p className="pv2-body">
                      <T k={k(`pillars.${p.id}.desc`)} />
                    </p>
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
            eyebrow={<T k={c("sideBySide")} />}
            title={<T k={c("tableTitle")} values={name} />}
            lede={<T k={k("table.lede")} />}
          />
          <ComparisonTable ns={ns} otherName={otherName} rows={rows} />
          <p className="vs-foot">
            <T k={c("footnote")} values={{ name: otherName, owner }} />
          </p>
        </div>
      </section>

      <section className="pv2-sec" aria-labelledby="h-vs-honest">
        <div className="pv2-wrap vs-prose-wrap">
          <SectionHead
            id="h-vs-honest"
            align="left"
            eyebrow={<T k={c("honestPart")} />}
            title={<T k={c("whenBetter")} values={name} />}
          />
          <div className={cn("vs-prose", STRONG)}>
            {Array.from({ length: paragraphs }, (_, i) => (
              <p key={i}>
                <T k={k(`whenBetter.p${i + 1}`)} />
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="pv2-sec vs-sec-tight" aria-labelledby="h-vs-more">
        <div className="pv2-wrap">
          <SectionHead
            id="h-vs-more"
            eyebrow={<T k={c("goDeeper")} />}
            title={<T k={c("readDetails")} />}
          />
          <ul className="vs-grid">
            {related.map(({ href, Icon, id }) => (
              <li key={href}>
                <Link href={href} className={cn(cardSurfaceSm, "pv2-card-link vs-card vs-link")}>
                  <IconWell icon={Icon} />
                  <h3 className="pv2-h3 vs-link-title">
                    <T k={c(`related.${id}.title`)} />
                    <ArrowRight className="vs-link-arrow rtl:-scale-x-100" aria-hidden="true" />
                  </h3>
                  <p className="pv2-body">
                    <T k={c(`related.${id}.desc`)} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ClosingCta id="start" className="pb-12" />
    </div>
  );
}
