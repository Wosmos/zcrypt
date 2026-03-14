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

export default function DocsPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="py-24 md:py-32 px-4">
        <div className="max-w-3xl mx-auto text-center">
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
              const Wrapper = cat.href
                ? ({ children, className }: { children: React.ReactNode; className: string }) => (
                    <Link href={cat.href!} className={className}>{children}</Link>
                  )
                : ({ children, className }: { children: React.ReactNode; className: string }) => (
                    <div className={className}>{children}</div>
                  );

              return (
                <Wrapper
                  key={i}
                  className={`card p-6 group transition-colors ${
                    cat.href
                      ? "hover:border-cyan-500/40 cursor-pointer"
                      : "opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:scale-110 transition-transform">
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
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 mt-2">
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
      <section className="py-24 px-4 bg-[var(--color-surface)]">
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
