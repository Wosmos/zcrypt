import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";

/** PageHero with the standard pair of CTAs used by every features/* page. */
export function FeatureHero({
  eyebrow,
  title,
  subtext,
  secondaryLabel,
  secondaryHref,
  trustLine,
  children,
}: {
  eyebrow: string;
  title: string;
  subtext: ReactNode;
  secondaryLabel: ReactNode;
  secondaryHref: string;
  trustLine?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PageHero
      eyebrow={eyebrow}
      title={title}
      lede={subtext}
      note={trustLine}
      actions={
        <>
          <PillLink href="/register">Start free</PillLink>
          <PillLink href={secondaryHref} variant="secondary" arrow>
            {secondaryLabel}
          </PillLink>
        </>
      }
    >
      {children}
    </PageHero>
  );
}
