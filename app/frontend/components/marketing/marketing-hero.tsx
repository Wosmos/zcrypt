import type { ReactNode } from "react";
import { Check } from "@/lib/icons";

interface MarketingHeroProps {
  badge: ReactNode;
  headline: ReactNode;
  subtext: ReactNode;
  cta: ReactNode;
  trustItems?: string[];
  minHeight?: string;
}

export function MarketingHero({
  badge,
  headline,
  subtext,
  cta,
  trustItems,
  minHeight = "min-h-[64dvh]",
}: MarketingHeroProps) {
  return (
    <section
      // -mt-4 cancels the nav's 16px flow spacer so the hero's gradient reaches
      // the very top of the screen (no plain-background seam above it).
      className={`relative -mt-4 flex ${minHeight} flex-col items-center justify-center overflow-hidden px-6 py-24 md:py-32`}
    >
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--color-bg)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px] dark:bg-cyan-500/8" />
        <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-violet-500/8 blur-[100px]" />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="mb-8">{badge}</div>

        {headline}

        <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
          {subtext}
        </p>

        <div className="mt-10">{cta}</div>

        {trustItems && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--color-text-muted)]">
            {trustItems.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
