import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";

/**
 * Shared scaffolding for the anonymous tool landing pages (pad / send /
 * transfer). Each page assembles these blocks with its own copy, feature list,
 * and tool composer; the pad/send-vs-transfer "how it works" variants stay
 * inline per page (deliberately not unified).
 */

type ToolIcon = typeof import("@/lib/icons")["File"];

export interface ToolFeature {
  icon: ToolIcon;
  title: string;
  desc: string;
}

/** Page frame: full-height column with the marketing nav, main region, footer. */
export function ToolPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)]">
      <MarketingNav />

      <main className="flex-1">{children}</main>

      <MarketingFooter />
    </div>
  );
}

/** Centered hero: pill badge, two-tone heading, and a lead paragraph. */
export function ToolHero({
  badgeIcon: BadgeIcon,
  badgeLabel,
  titleLead,
  titleAccent,
  subtitle,
}: {
  badgeIcon: ToolIcon;
  badgeLabel: string;
  titleLead: string;
  titleAccent: string;
  subtitle: string;
}) {
  return (
    <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-muted)] mb-6">
          <BadgeIcon className="h-3 w-3 text-[var(--color-accent)]" />
          {badgeLabel}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold font-heading tracking-tight leading-tight">
          {titleLead}{" "}
          <span className="text-[var(--color-accent)]">{titleAccent}</span>
        </h1>
        <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      </div>
    </section>
  );
}

/**
 * Tool composer container. `maxWidth` is a full Tailwind class (e.g. "max-w-2xl"
 * for pad, "max-w-lg" for send/transfer) so the JIT can still see it at the
 * call site.
 */
export function ToolSection({
  maxWidth,
  children,
}: {
  maxWidth: string;
  children: ReactNode;
}) {
  return (
    <section className="pb-16 sm:pb-20">
      <div className={`mx-auto ${maxWidth} px-4 sm:px-6`}>{children}</div>
    </section>
  );
}

/** Feature grid on a surface band — heading plus a responsive card grid. */
export function FeatureGrid({
  heading,
  features,
}: {
  heading: string;
  features: ToolFeature[];
}) {
  return (
    <section className="py-16 sm:py-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-12">
          {heading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <f.icon className="h-5 w-5 text-[var(--color-accent)] mb-3" />
              <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing call-to-action: heading, blurb, and the register / features buttons. */
export function ToolCta({
  heading,
  description,
}: {
  heading: string;
  description: string;
}) {
  return (
    <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-4">
          {heading}
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">
          {description}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/register" className="px-6 py-2.5 text-sm font-semibold bg-[var(--color-text)] text-[var(--color-bg)] rounded-xl hover:opacity-90 transition-opacity">
            Get started free
          </Link>
          <Link href="/features" className="px-6 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-surface-1)] transition-colors">
            See features
          </Link>
        </div>
      </div>
    </section>
  );
}
