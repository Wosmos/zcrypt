import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { IconWell, MarketingCard } from "@/components/marketing/ui/card";
import { SectionHead, headId } from "@/components/marketing/landing/section-head";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { cn } from "@/lib/utils";

type ToolIcon = typeof import("@/lib/icons")["File"];

export interface ToolFeature {
  icon: ToolIcon;
  title: string;
  desc: string;
}

export function ToolHero({
  badgeIcon: BadgeIcon,
  badgeLabel,
  titleLead,
  titleAccent,
  subtitle,
}: {
  badgeIcon: ToolIcon;
  badgeLabel: string;
  titleLead: string;
  titleAccent: string;
  subtitle: string;
}) {
  return (
    <PageHero
      badge={
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
          <BadgeIcon className="h-3 w-3 text-[var(--color-accent)]" />
          {badgeLabel}
        </span>
      }
      title={
        <>
          {titleLead} <span className="text-[var(--color-accent)]">{titleAccent}</span>
        </>
      }
      accent={false}
      lede={subtitle}
    />
  );
}

export function ToolSection({ maxWidth, children }: { maxWidth: string; children: ReactNode }) {
  return (
    <section className="pv2-sec pv2-sec-join">
      <div className="pv2-wrap">
        <div className={cn("mx-auto", maxWidth)}>{children}</div>
      </div>
    </section>
  );
}

export interface ToolStep {
  step: string;
  title: string;
  desc: string;
}

export function ToolBand({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  const id = headId(title);
  return (
    <section className="pv2-sec" aria-labelledby={id}>
      <div className="pv2-wrap">
        <SectionHead id={id} title={title} lede={lede} />
        {children}
      </div>
    </section>
  );
}

export function StepGrid({ steps }: { steps: ToolStep[] }) {
  return (
    <ol className="grid list-none grid-cols-1 gap-4 md:grid-cols-3">
      {steps.map((s) => (
        <MarketingCard key={s.step} as="li" size="sm" className="p-6 sm:p-7">
          <span className="pv2-ic corner-squircle text-lg font-bold" aria-hidden="true">
            {s.step}
          </span>
          <h3 className="pv2-h3 mt-5">{s.title}</h3>
          <p className="pv2-body mt-2">{s.desc}</p>
        </MarketingCard>
      ))}
    </ol>
  );
}

export function FeatureGrid({ heading, features }: { heading: string; features: ToolFeature[] }) {
  return (
    <ToolBand title={heading}>
      <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <MarketingCard key={f.title} as="li" size="sm" className="p-6 sm:p-7">
            <IconWell icon={f.icon} />
            <h3 className="pv2-h3 mt-5">{f.title}</h3>
            <p className="pv2-body mt-2">{f.desc}</p>
          </MarketingCard>
        ))}
      </ul>
    </ToolBand>
  );
}

export function ToolCta({ heading, description }: { heading: string; description: string }) {
  return (
    <ClosingCta
      title={heading}
      subtext={description}
      secondary={{ href: "/features", label: "See features" }}
    />
  );
}
