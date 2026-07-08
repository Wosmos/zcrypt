import type { ComponentType, ReactNode } from "react";
import { PrimaryCta } from "./primary-cta";

export interface CtaSectionProps {
  heading: ReactNode;
  subtext: ReactNode;
  /** CTA label. Default "Create your vault". */
  ctaLabel?: ReactNode;
  /** CTA href. Default "/register". */
  ctaHref?: string;
  /** Optional icon shown above the heading (file-viewers uses <Eye/>). */
  icon?: ComponentType<{ className?: string }>;
}

/**
 * The closing "big CTA card" that ends every features/* and vs/* page: a
 * surface-filled rounded card with a heading, a short subtext, and the gradient
 * primary CTA. An optional icon renders above the heading. Does not render an
 * outer <section> — the page owns the wrapping section (and its padding).
 */
export function CtaSection({ heading, subtext, ctaLabel, ctaHref, icon: Icon }: CtaSectionProps) {
  return (
    <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
      {Icon && (
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h2>
      <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">{subtext}</p>
      <PrimaryCta label={ctaLabel} href={ctaHref} className="mt-7" />
    </div>
  );
}
