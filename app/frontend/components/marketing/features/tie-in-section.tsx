import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";

export interface TieInSectionProps {
  eyebrow: ReactNode;
  heading: ReactNode;
  body: ReactNode;
  /** The left column's checklist/callout — typically an <IconList />. */
  checklist?: ReactNode;
  linkLabel?: ReactNode;
  linkHref?: string;
  /** The right column — typically a <CodePanel /> or other mock. */
  panel: ReactNode;
  /** Section background. `true` (default) adds the border-y + surface
   *  treatment; `false` renders a plain section. */
  surface?: boolean;
  /** Override the outer `<section>` className entirely (ignores `surface`). */
  sectionClassName?: string;
}

/**
 * The 2-column "tie a feature into the bigger story" section repeated across
 * features/* pages: eyebrow + heading + body + optional checklist + link on
 * the left, a mock panel on the right. Only the copy and the panel contents
 * are page-specific.
 */
export function TieInSection({
  eyebrow,
  heading,
  body,
  checklist,
  linkLabel,
  linkHref,
  panel,
  surface = true,
  sectionClassName,
}: TieInSectionProps) {
  const resolvedSectionClassName =
    sectionClassName ??
    (surface
      ? "mt-16 border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20"
      : "px-4 py-20");

  return (
    <section className={resolvedSectionClassName}>
      <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            {eyebrow}
          </p>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
            {body}
          </p>
          {checklist}
          {linkLabel && linkHref && (
            <Link
              href={linkHref}
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              {linkLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {panel}
      </div>
    </section>
  );
}
