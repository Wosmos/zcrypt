import type { Metadata } from "next";
import Link from "next/link";
import {
  Rocket,
  Shield,
  Code,
  Terminal,
  HardDrive,
  Globe,
  Zap,
  ArrowRight,
  Mail,
  Sparkles,
  Bell,
  Eye,
  FileText,
  Users,
  Crown,
  Cog,
  Layers,
} from "@/lib/icons";
import { docsCategories } from "@/lib/data";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import DocsSearch from "@/components/docs/docs-search";

export const metadata: Metadata = {
  title: "Documentation | zcrypt",
  description:
    "Learn how to use zcrypt. Guides for getting started, security, API reference, terminal app, self-hosting, and more.",
  alternates: {
    canonical: "https://zcrypt.cloud/docs",
  },
  openGraph: {
    title: "Documentation | zcrypt",
    description:
      "Learn how to use zcrypt. Guides for getting started, security, API reference, terminal app, and more.",
    url: "https://zcrypt.cloud/docs",
  },
};

const iconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  Rocket,
  Shield,
  Code,
  Terminal,
  HardDrive,
  Globe,
  Zap,
  Bell,
  Eye,
  FileText,
  Users,
  Crown,
  Cog,
  // "How It Works" uses the "Workflow" string in lib/data.ts; map it to an
  // available icon so the card always renders an icon.
  Workflow: Layers,
};

const iconColors: Record<string, string> = {
  Rocket: "text-cyan-500",
  Shield: "text-violet-500",
  Code: "text-blue-500",
  Terminal: "text-emerald-500",
  HardDrive: "text-amber-500",
  Globe: "text-rose-500",
  Zap: "text-orange-500",
  Bell: "text-amber-500",
  Eye: "text-violet-500",
  FileText: "text-emerald-500",
  Users: "text-cyan-500",
  Crown: "text-amber-500",
  Cog: "text-slate-500",
};

const iconBgs: Record<string, string> = {
  Rocket: "bg-cyan-500/10",
  Shield: "bg-violet-500/10",
  Code: "bg-blue-500/10",
  Terminal: "bg-emerald-500/10",
  HardDrive: "bg-amber-500/10",
  Globe: "bg-rose-500/10",
  Zap: "bg-orange-500/10",
  Bell: "bg-amber-500/10",
  Eye: "bg-violet-500/10",
  FileText: "bg-emerald-500/10",
  Users: "bg-cyan-500/10",
  Crown: "bg-amber-500/10",
  Cog: "bg-slate-500/10",
};

// Titles that belong to the "advanced / privacy" group. Everything else is
// treated as a core feature so newcomers see the essentials first. Matching is
// done on the category title (the source list lives in lib/data.ts).
const advancedTitles = new Set([
  "Dead Man's Switch",
  "Decoy Profile",
  "Advanced Usage",
  "Self-Hosting",
  "API Reference",
]);

function CategoryCard({ cat }: { cat: (typeof docsCategories)[number] }) {
  const Icon = iconMap[cat.icon];
  const color = iconColors[cat.icon] ?? "text-cyan-500";
  const bg = iconBgs[cat.icon] ?? "bg-cyan-500/10";
  const className = `card p-6 group transition-all duration-200 ${
    cat.href
      ? "hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 cursor-pointer"
      : "opacity-60"
  }`;

  const inner = (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} ${color} group-hover:scale-110 transition-transform`}
        >
          {Icon && <Icon size={18} />}
        </div>
        <h3 className="text-sm font-bold">{cat.title}</h3>
        {cat.comingSoon && (
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-1)] px-2 py-0.5 rounded-full">
            Coming soon
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {cat.desc}
      </p>
      {cat.href && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 mt-3 group-hover:gap-2 transition-all">
          Read more
          <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </>
  );

  return cat.href ? (
    <Link href={cat.href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export default function DocsPage() {
  const coreCategories = docsCategories.filter(
    (cat) => !advancedTitles.has(cat.title),
  );
  const advancedCategories = docsCategories.filter((cat) =>
    advancedTitles.has(cat.title),
  );

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
        ]}
      />
      {/* ═══ HERO ═══ */}
      <section className="pt-24 md:pt-32 pb-16 px-4 relative z-10">
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-cyan-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-4">
            <Sparkles className="h-3 w-3" />
            Documentation
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight font-heading">
            Documentation
          </h1>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-xl mx-auto leading-relaxed">
            zcrypt is free, open-source, zero-knowledge cloud storage that
            encrypts your files on your device and stores them inside your own
            connected platform accounts.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm">
            <span className="text-[var(--color-text-muted)]">New here?</span>
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-1 font-semibold text-cyan-600 dark:text-cyan-400 hover:gap-2 transition-all"
            >
              Start with Getting Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-8">
            <DocsSearch />
          </div>
        </div>
      </section>

      {/* ═══ CORE FEATURES ═══ */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Core
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              The essentials: connect storage, encrypt and upload, share, and
              access your files.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {coreCategories.map((cat) => (
              <CategoryCard key={cat.title} cat={cat} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ADVANCED & PRIVACY FEATURES ═══ */}
      <section className="pb-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Advanced &amp; privacy
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Optional, power-user features. Come back to these once you are
              comfortable with the basics.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {advancedCategories.map((cat) => (
              <CategoryCard key={cat.title} cat={cat} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-20 px-4 bg-[var(--color-surface)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Can&apos;t find what you need?
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-3">
            We&apos;re building out our docs. In the meantime, reach out and
            we&apos;ll help directly.
          </p>
          <a
            href="mailto:support@zcrypt.cloud"
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold hover:bg-[var(--color-surface-1)] transition-colors"
          >
            <Mail className="h-4 w-4" />
            Contact support
          </a>
        </div>
      </section>
    </>
  );
}
