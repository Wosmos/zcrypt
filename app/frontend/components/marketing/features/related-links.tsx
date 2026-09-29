import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SectionHead, headId } from "@/components/marketing/landing/section-head";
import { cardSurfaceSm } from "@/components/marketing/ui/card";

export interface RelatedLinkItem {
  href: string;
  title: ReactNode;
  desc: ReactNode;
  Icon?: ComponentType<{ className?: string }>;
}

/** The "Keep exploring" row of linked cards near the end of a page. */
export function RelatedLinks({
  heading = "Keep exploring",
  eyebrow = "Related",
  items,
  columns = 3,
}: {
  heading?: string;
  eyebrow?: string;
  items: RelatedLinkItem[];
  columns?: 2 | 3;
}) {
  const id = headId(heading, "related");
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
                  <ArrowRight className="ml-auto h-4 w-4 text-[var(--pv2-accent-ink)] transition-transform group-hover:translate-x-0.5" />
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
