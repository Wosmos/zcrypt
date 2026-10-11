import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { T } from "@/components/i18n/t";

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
  eyebrow: ReactNode;
  title: ReactNode;
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
          <PillLink href="/register">
            <T k="site.features.common.startFree" />
          </PillLink>
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
