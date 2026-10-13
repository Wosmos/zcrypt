import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { T } from "@/components/i18n/t";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/site";

/** PageHero with the standard pair of CTAs used by every features/* page. */
export function FeatureHero({
  eyebrow,
  title,
  highlight,
  subtext,
  secondaryLabel,
  secondaryHref,
  trustLine,
  breadcrumb,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  highlight?: ReactNode;
  subtext: ReactNode;
  secondaryLabel: ReactNode;
  secondaryHref: string;
  trustLine?: ReactNode;
  /** Structured-data trail: Home > Features (parent page) > this page. */
  breadcrumb?: { name: string; path: string; parent: string };
  children?: ReactNode;
}) {
  return (
    <>
      {breadcrumb ? (
        <BreadcrumbJsonLd
          items={[
            { name: "Home", url: SITE_URL },
            { name: "Features", url: `${SITE_URL}${breadcrumb.parent}` },
            { name: breadcrumb.name, url: `${SITE_URL}${breadcrumb.path}` },
          ]}
        />
      ) : null}
      <PageHero
        eyebrow={eyebrow}
        title={title}
        highlight={highlight}
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
    </>
  );
}
