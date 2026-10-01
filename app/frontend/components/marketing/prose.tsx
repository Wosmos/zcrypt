import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { Section } from "@/components/marketing/section-reveal";

/** Reading measure shared by the long-form pages (about, philosophy, privacy, terms). */
export const readingWidth = "[--pv2-container:44rem]";

export const readingArticle = `pv2-wrap pt-8 sm:pt-0 ${readingWidth}`;

/** The homepage inline link: accent ink, soft underline. */
export const proseLink =
  "font-semibold text-[var(--pv2-accent-ink)] underline decoration-[color-mix(in_oklab,var(--color-accent)_40%,transparent)] underline-offset-[3px] transition-colors hover:decoration-[var(--color-accent)]";

/** Scales SectionHead down to a reading-page heading. */
export const proseHeadSize = "[&_.pv2-h2]:text-[clamp(1.75rem,1.35rem+1.6vw,2.5rem)]!";

export const proseBody = "space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]";

export function ReadingPage({
  eyebrow,
  title,
  lede,
  after,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero align="left" className={readingWidth} eyebrow={eyebrow} title={title} lede={lede} />
      <article className={cn(readingArticle, "pb-8")}>{children}</article>
      {after}
    </>
  );
}

/** One heading-led block of a reading page: eyebrow + SectionHead title, then prose. */
export function ProseSection({
  id,
  eyebrow,
  title,
  className,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Section className={cn("mt-20 first:mt-0 scroll-mt-24", className)}>
      <SectionHead
        id={id}
        eyebrow={eyebrow}
        title={title}
        align="left"
        className={cn("mb-6!", proseHeadSize)}
      />
      {children}
    </Section>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="my-12 border-l-2 border-[var(--color-accent)] pl-6">
      <p className="font-heading text-2xl font-bold leading-snug tracking-tight text-[var(--color-text)] text-balance sm:text-[1.75rem]">
        {children}
      </p>
    </blockquote>
  );
}

export function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-base leading-relaxed text-[var(--color-text-secondary)]">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
