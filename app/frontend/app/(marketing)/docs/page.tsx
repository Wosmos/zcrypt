import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, Sparkles } from "@/lib/icons";
import { docsNav, type DocsNavLink } from "@/lib/data";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import DocsSearch from "@/components/docs/docs-search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Documentation | zcrypt",
  description:
    "Learn how to use zcrypt — the zero-knowledge encrypted cloud drive. Guides for folders, file previews, per-folder encryption, sharing, storage backends, the API, and self-hosting.",
  alternates: { canonical: "https://zcrypt.cloud/docs" },
  openGraph: {
    title: "Documentation | zcrypt",
    description:
      "Guides for the zcrypt encrypted cloud drive: folders, previews, per-folder encryption, sharing, storage backends, API, and self-hosting.",
    url: "https://zcrypt.cloud/docs",
  },
};

const BADGE_STYLES: Record<NonNullable<DocsNavLink["badge"]>, string> = {
  Beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Roadmap: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  New: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

function LinkCard({ link }: { link: DocsNavLink }) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold">{link.title}</h3>
        {link.badge && (
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
              BADGE_STYLES[link.badge]
            )}
          >
            {link.badge}
          </span>
        )}
        {link.external && (
          <ExternalLink className="h-3 w-3 text-[var(--color-text-muted)]" />
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
        {link.desc}
      </p>
    </>
  );

  const className =
    "card group p-4 transition-colors hover:border-cyan-500/40";

  return link.external ? (
    <a href={link.href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {inner}
    </Link>
  );
}

export default function DocsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
        ]}
      />

      {/* Intro */}
      <header className="mb-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
          <Sparkles className="h-3 w-3" />
          Documentation
        </div>
        <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
          Documentation
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
          zcrypt is a zero-knowledge encrypted cloud drive: real folders, instant
          in-browser previews, and per-folder passwords — all encrypted on your
          device and stored in accounts you already own. These guides cover every
          part of it.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-muted)]">New here?</span>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1 font-semibold text-cyan-600 transition-all hover:gap-2 dark:text-cyan-400"
          >
            Start with the Quickstart
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-8">
          <DocsSearch />
        </div>
      </header>

      {/* Grouped index */}
      <div className="space-y-12">
        {docsNav.map((group) => (
          <section key={group.title}>
            <div className="mb-4">
              <h2 className="font-heading text-lg font-bold tracking-tight">{group.title}</h2>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{group.summary}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.links.map((link) => (
                <LinkCard key={link.href + link.title} link={link} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Help CTA */}
      <section className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <h2 className="text-xl font-bold tracking-tight">Can&apos;t find what you need?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
          The whole project is open source. Open an issue, read the code, or reach
          out and we&apos;ll help directly.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://github.com/Wosmos/zcrypt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-1)]"
          >
            GitHub
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href="mailto:support@zcrypt.cloud"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-1)]"
          >
            Contact support
          </a>
        </div>
      </section>
    </>
  );
}
