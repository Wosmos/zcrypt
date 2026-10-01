import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHead, headId } from "@/components/marketing/landing/section-head";
import { IconWell, cardSurfaceSm } from "@/components/marketing/ui/card";

export interface CapabilityItem {
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: ReactNode;
  desc: ReactNode;
}

const COLS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

function CapabilityCards({
  items,
  columns = 3,
  titleAs: Title = "h3",
}: {
  items: CapabilityItem[];
  columns?: keyof typeof COLS;
  titleAs?: "h2" | "h3";
}) {
  return (
    <ul className={cn("grid list-none grid-cols-1 gap-4", COLS[columns])}>
      {items.map(({ Icon, title, desc }, i) => (
        <li key={i}>
          <article className={cn(cardSurfaceSm, "h-full p-6 sm:p-7")}>
            <IconWell icon={Icon} />
            <Title className="pv2-h3 mt-5 text-lg">{title}</Title>
            <p className="pv2-body mt-2 text-[15px]">{desc}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** Numbered step cards, four across on wide screens. */
export function StepCards({
  steps,
}: {
  steps: { step: ReactNode; title: ReactNode; desc: ReactNode }[];
}) {
  return (
    <ol className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ step, title, desc }, i) => (
        <li key={i} className={cn(cardSurfaceSm, "p-6 sm:p-7")}>
          <div className="font-mono text-[13px] font-semibold tracking-[0.08em] text-[var(--pv2-accent-ink)]">
            {step}
          </div>
          <h3 className="pv2-h3 mt-4 text-lg">{title}</h3>
          <p className="pv2-body mt-2">{desc}</p>
        </li>
      ))}
    </ol>
  );
}

/** A section of icon cards on the homepage card surface, with an optional SectionHead. */
export function CapabilityGrid({
  items,
  eyebrow,
  heading,
  subheading,
  columns = 3,
  join = false,
  footnote,
}: {
  items: CapabilityItem[];
  eyebrow?: ReactNode;
  heading?: ReactNode;
  subheading?: ReactNode;
  columns?: keyof typeof COLS;
  join?: boolean;
  footnote?: ReactNode;
}) {
  const id = heading ? headId(heading) : undefined;
  return (
    <section className={cn("pv2-sec", join && "pv2-sec-join")} aria-labelledby={id}>
      <div className="pv2-wrap">
        {heading ? (
          <SectionHead id={id} eyebrow={eyebrow} title={heading} lede={subheading} />
        ) : null}
        <CapabilityCards items={items} columns={columns} />
        {footnote ? (
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-[var(--color-text-muted)]">
            {footnote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
