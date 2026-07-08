import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";

export interface RelatedLinkItem {
  href: string;
  title: ReactNode;
  desc: ReactNode;
  /** Optional leading icon (vs/* + a few features pages). */
  Icon?: ComponentType<{ className?: string }>;
}

export interface RelatedLinksProps {
  /** "Keep exploring" (features) or "Go deeper" (vs). */
  heading: ReactNode;
  items: RelatedLinkItem[];
  /** Grid classes. Default features 3-up grid. */
  gridClassName?: string;
}

/**
 * The "Keep exploring" / "Go deeper" grid of related-page link cards shown near
 * the bottom of every features/* and vs/* page. Each card reveals a trailing
 * arrow on hover; an optional leading icon is shown when the item provides one.
 * Does not render an outer <section> — the page owns the wrapping section.
 */
export function RelatedLinks({
  heading,
  items,
  gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-3",
}: RelatedLinksProps) {
  return (
    <>
      <h2 className="mb-6 font-heading text-xl font-bold">{heading}</h2>
      <div className={gridClassName}>
        {items.map((item) => {
          const { Icon } = item;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="card group p-5 transition-colors hover:border-cyan-500/40"
            >
              <h3 className="flex items-center gap-2 text-sm font-bold">
                {Icon && <Icon className="h-4 w-4 text-cyan-500" />}
                {item.title}
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.desc}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
