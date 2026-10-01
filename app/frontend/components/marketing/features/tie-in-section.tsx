import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SectionHead, headId } from "@/components/marketing/landing/section-head";

/** Two columns: a left-aligned SectionHead with body, checklist and link, and a panel. */
export function TieInSection({
  eyebrow,
  heading,
  body,
  checklist,
  linkLabel,
  linkHref,
  panel,
  join = false,
}: {
  eyebrow?: ReactNode;
  heading: ReactNode;
  body: ReactNode;
  checklist?: ReactNode;
  linkLabel?: ReactNode;
  linkHref?: string;
  panel: ReactNode;
  join?: boolean;
}) {
  const id = headId(heading, "tie-in");
  return (
    <section className={cn("pv2-sec", join && "pv2-sec-join")} aria-labelledby={id}>
      <div className="pv2-wrap grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHead
            id={id}
            eyebrow={eyebrow}
            title={heading}
            lede={body}
            align="left"
            className="pv2-head-flush pv2-head-col"
          />
          {checklist}
          {linkLabel && linkHref ? (
            <Link
              href={linkHref}
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pv2-accent-ink)] transition-all hover:gap-2.5"
            >
              {linkLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        {panel}
      </div>
    </section>
  );
}
