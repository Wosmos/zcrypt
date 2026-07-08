import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { Section } from "@/components/marketing/section-reveal";

// Shared page scaffold for the long-form legal pages (privacy, terms) so the
// header chrome and footer CTA stay identical instead of each page redefining
// them. Pages pass their numbered <Section> blocks as children.

export function LegalPage({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-28 pb-20">
      <article className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <Section>
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-4">
            {eyebrow}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
            {title}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mt-4 leading-relaxed">
            {lead}
          </p>
          <div className="h-px bg-[var(--color-border)] mt-10" />
        </Section>

        {children}
      </article>
    </div>
  );
}

export function LegalCta({
  seeAlsoHref,
  seeAlsoLabel,
}: {
  seeAlsoHref: string;
  seeAlsoLabel: string;
}) {
  return (
    <Section className="mt-20 pt-10 border-t border-[var(--color-border)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-muted)]">
          See also:{" "}
          <Link
            href={seeAlsoHref}
            className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
          >
            {seeAlsoLabel}
          </Link>
        </p>
        <Link
          href="/register"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400 transition-colors shadow-xl shadow-cyan-500/25"
        >
          Get started <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Section>
  );
}
