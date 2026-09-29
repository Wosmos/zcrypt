import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { landingSections } from "@/lib/data";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { Underlined } from "@/components/marketing/landing/pencil-underline";
import { HoverReveal } from "@/components/marketing/landing/hover-reveal";

/** The site-wide closing call to action, shared by the homepage and /preview-v2. */
export function ClosingCta({
  id,
  label,
  className,
}: {
  id?: string;
  label?: string;
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/8 dark:bg-cyan-500/3 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl text-center">
        <ScrollReveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">
            {landingSections.cta.eyebrow}
          </p>
          <h2 id={headingId} className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            The drive you{" "}
            <Underlined variant="highlight">
              <em className="italic">actually own.</em>
            </Underlined>
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
            {landingSections.cta.subtext}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="mt-10 relative inline-flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold text-slate-900 bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              {label ?? landingSections.cta.button} <ArrowRight className="h-4 w-4" />
            </Link>
            <HoverReveal />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
