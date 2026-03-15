import type { Metadata } from "next";
import Link from "next/link";
import {
  Rocket,
  Shield,
  Code,
  Terminal,
  HardDrive,
  Globe,
  ArrowRight,
  Mail,
  Sparkles,
} from "@/lib/icons";
import { docsCategories } from "@/lib/data";

export const metadata: Metadata = {
  title: "Documentation — zcrypt",
  description:
    "Learn how to use zcrypt. Guides for getting started, security, API reference, terminal app, self-hosting, and more.",
};

const iconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = { Rocket, Shield, Code, Terminal, HardDrive, Globe };

const iconColors: Record<string, string> = {
  Rocket: "text-cyan-500",
  Shield: "text-violet-500",
  Code: "text-blue-500",
  Terminal: "text-emerald-500",
  HardDrive: "text-amber-500",
  Globe: "text-rose-500",
};

const iconBgs: Record<string, string> = {
  Rocket: "bg-cyan-500/10",
  Shield: "bg-violet-500/10",
  Code: "bg-blue-500/10",
  Terminal: "bg-emerald-500/10",
  HardDrive: "bg-amber-500/10",
  Globe: "bg-rose-500/10",
};

export default function DocsPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="pt-24 md:pt-32 pb-16 px-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
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
            Everything you need to get started with zcrypt, understand our
            security model, and build on our platform.
          </p>
        </div>
      </section>

      {/* ═══ CATEGORY GRID ═══ */}
      <section className="pb-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {docsCategories.map((cat, i) => {
              const Icon = iconMap[cat.icon];
              const color = iconColors[cat.icon] ?? "text-cyan-500";
              const bg = iconBgs[cat.icon] ?? "bg-cyan-500/10";
              const Wrapper = cat.href
                ? ({
                    children,
                    className,
                  }: {
                    children: React.ReactNode;
                    className: string;
                  }) => (
                    <Link href={cat.href!} className={className}>
                      {children}
                    </Link>
                  )
                : ({
                    children,
                    className,
                  }: {
                    children: React.ReactNode;
                    className: string;
                  }) => <div className={className}>{children}</div>;

              return (
                <Wrapper
                  key={i}
                  className={`card p-6 group transition-all duration-200 ${
                    cat.href
                      ? "hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 cursor-pointer"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl ${bg} ${color} group-hover:scale-110 transition-transform`}
                    >
                      {Icon && <Icon size={20} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
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
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 mt-2 group-hover:gap-2 transition-all">
                          Read more
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </Wrapper>
              );
            })}
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
