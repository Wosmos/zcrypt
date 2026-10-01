import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { landingSections } from "@/lib/data";
import { Section } from "@/components/marketing/section-reveal";
import { Underlined } from "@/components/marketing/landing/pencil-underline";
import { HoverReveal } from "@/components/marketing/landing/hover-reveal";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { Accent } from "@/components/marketing/ui/page-hero";

/** The site-wide closing call to action. */
export function ClosingCta({
  id,
  label,
  eyebrow,
  title,
  subtext,
  secondary,
  className,
}: {
  id?: string;
  label?: string;
  eyebrow?: string;
  title?: string;
  subtext?: ReactNode;
  secondary?: { href: string; label: string };
  className?: string;
}) {
  const headingId = id ? `${id}-title` : "closing-cta-title";
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("py-32 px-4 relative overflow-hidden", className)}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(closest-side,rgb(6_182_212/0.08),transparent)] dark:bg-[radial-gradient(closest-side,rgb(6_182_212/0.03),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-2xl text-center">
        <Section as="div">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">
            {eyebrow ?? landingSections.cta.eyebrow}
          </p>
          <h2 id={headingId} className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {title ? (
              <>
                {title}
                <Accent text={title} />
              </>
            ) : (
              <>
                The drive you{" "}
                <Underlined variant="highlight">
                  <em className="italic">actually own.</em>
                </Underlined>
              </>
            )}
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
            {subtext ?? landingSections.cta.subtext}
          </p>
        </Section>

        <Section as="div" delay={0.2}>
          <div className="mt-10 relative inline-flex flex-wrap items-center justify-center gap-4">
            <PillLink href="/register" size="lg">
              {label ?? landingSections.cta.button}
            </PillLink>
            {secondary ? (
              <PillLink href={secondary.href} variant="secondary" size="lg">
                {secondary.label}
              </PillLink>
            ) : null}
            <HoverReveal />
          </div>
        </Section>
      </div>
    </section>
  );
}
