import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { IconWell, MarketingCard } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { T } from "@/components/i18n/t";
import { ToolCtaBlock } from "@/components/tools/tool-cta";
import { cn } from "@/lib/utils";

type ToolIcon = typeof import("@/lib/icons")["File"];

export interface ToolFeature {
  icon: ToolIcon;
  id: string;
}

export function ToolHero({ badgeIcon: BadgeIcon, base }: { badgeIcon: ToolIcon; base: string }) {
  return (
    <PageHero
      badge={
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
          <BadgeIcon className="h-3 w-3 text-[var(--color-accent)]" />
          <T k={`${base}.badge`} />
        </span>
      }
      title={<T k={`${base}.titleLead`} />}
      highlight={<T k={`${base}.titleAccent`} />}
      lede={<T k={`${base}.subtitle`} />}
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

export function ToolBand({
  id,
  titleKey,
  ledeKey,
  accent,
  children,
}: {
  id: string;
  titleKey: string;
  ledeKey?: string;
  accent?: string | false;
  children: ReactNode;
}) {
  return (
    <section className="pv2-sec" aria-labelledby={id}>
      <div className="pv2-wrap">
        <SectionHead
          id={id}
          title={<T k={titleKey} />}
          lede={ledeKey ? <T k={ledeKey} /> : undefined}
          accent={accent}
        />
        {children}
      </div>
    </section>
  );
}

export function StepGrid({ base }: { base: string }) {
  return (
    <ol className="grid list-none grid-cols-1 gap-4 md:grid-cols-3">
      {["1", "2", "3"].map((n) => (
        <MarketingCard key={n} as="li" size="sm" className="p-6 sm:p-7">
          <span className="pv2-ic corner-squircle text-lg font-bold" aria-hidden="true">
            {n}
          </span>
          <h3 className="pv2-h3 mt-5">
            <T k={`${base}.s${n}.title`} />
          </h3>
          <p className="pv2-body mt-2">
            <T k={`${base}.s${n}.desc`} />
          </p>
        </MarketingCard>
      ))}
    </ol>
  );
}

export function FeatureGrid({
  id,
  base,
  accent,
  features,
}: {
  id: string;
  base: string;
  accent?: string | false;
  features: ToolFeature[];
}) {
  return (
    <ToolBand id={id} titleKey={`${base}.heading`} accent={accent}>
      <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <MarketingCard key={f.id} as="li" size="sm" className="p-6 sm:p-7">
            <IconWell icon={f.icon} />
            <h3 className="pv2-h3 mt-5">
              <T k={`${base}.${f.id}.title`} />
            </h3>
            <p className="pv2-body mt-2">
              <T k={`${base}.${f.id}.desc`} />
            </p>
          </MarketingCard>
        ))}
      </ul>
    </ToolBand>
  );
}

export function ToolCta({ base }: { base: string }) {
  return <ToolCtaBlock base={base} />;
}
