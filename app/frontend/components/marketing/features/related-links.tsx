import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n/t";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { cardSurfaceSm } from "@/components/marketing/ui/card";

export interface RelatedLinkItem {
  href: string;
  title: ReactNode;
  desc: ReactNode;
  Icon?: ComponentType<{ className?: string }>;
}

/** The "Keep exploring" row of linked cards near the end of a page. */
export function RelatedLinks({
  heading = <T k="site.features.common.keepExploring" />,
  eyebrow = <T k="site.features.common.related" />,
  items,
  columns = 3,
}: {
  heading?: ReactNode;
  eyebrow?: ReactNode;
  items: RelatedLinkItem[];
  columns?: 2 | 3;
}) {
  const id = "h-related";
  return (
    <section className="pv2-sec pv2-sec-join" aria-labelledby={id}>
      <div className="pv2-wrap">
        <SectionHead id={id} eyebrow={eyebrow} title={heading} align="left" />
        <ul
          className={cn(
            "grid list-none grid-cols-1 gap-4",
            columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {items.map(({ href, title, desc, Icon }) => (
            <li key={href}>
              <Link href={href} className={cn(cardSurfaceSm, "group block h-full p-6")}>
                <h3 className="pv2-h3 flex items-center gap-2 text-base">
                  {Icon ? <Icon className="h-4 w-4 text-[var(--pv2-accent-ink)]" /> : null}
                  {title}
                  <ArrowRight className="rtl:-scale-x-100 ms-auto h-4 w-4 text-[var(--pv2-accent-ink)] transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </h3>
                <p className="pv2-body mt-2 text-sm">{desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
