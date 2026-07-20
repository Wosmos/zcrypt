import Link from "next/link";
import { docsNav, type DocsNavLink } from "@/lib/data";
import { BreadcrumbJsonLd, TechArticleJsonLd } from "@/components/seo/json-ld";
import { DocToc, type TocItem } from "@/components/docs/doc-toc";
import { ArrowLeft, ArrowRight, ChevronRight, AlertTriangle, Info, Lock } from "@/lib/icons";
import { cn } from "@/lib/utils";

const SITE = "https://zcrypt.cloud";

// Flattened, ordered list of internal doc links — drives prev/next + section lookup.
const flatDocs: { link: DocsNavLink; section: string }[] = docsNav.flatMap((group) =>
  group.links
    .filter((l) => !l.external && l.href.startsWith("/docs"))
    .map((link) => ({ link, section: group.title }))
);

function neighbors(href: string) {
  const i = flatDocs.findIndex((d) => d.link.href === href);
  if (i === -1) return { prev: undefined, next: undefined, section: undefined };
  return {
    prev: i > 0 ? flatDocs[i - 1] : undefined,
    next: i < flatDocs.length - 1 ? flatDocs[i + 1] : undefined,
    section: flatDocs[i].section,
  };
}

export type { TocItem };

/**
 * Shared scaffold for every documentation page: breadcrumb + TechArticle
 * structured data, a consistent header, an optional "on this page" TOC, the
 * article body, and an auto-derived prev/next pager from `docsNav`.
 */
export function DocPage({
  title,
  description,
  href,
  toc,
  badge,
  children,
}: {
  title: string;
  description: string;
  /** Canonical path of this page, e.g. "/docs/folders". Used for pager + breadcrumbs. */
  href: string;
  toc?: TocItem[];
  badge?: "Beta" | "Roadmap" | "New";
  children: React.ReactNode;
}) {
  const { prev, next, section } = neighbors(href);
  const url = `${SITE}${href}`;

  return (
    <article className="min-w-0 pb-20">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE },
          { name: "Documentation", url: `${SITE}/docs` },
          ...(section ? [{ name: section, url: `${SITE}/docs` }] : []),
          { name: title, url },
        ]}
      />
      <TechArticleJsonLd headline={title} description={description} url={url} section={section} />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex list-none flex-wrap items-center gap-1.5 text-[13px]">
          <li>
            <Link
              href="/docs"
              className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Docs
            </Link>
          </li>
          {section && (
            <>
              <li aria-hidden>
                <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />
              </li>
              <li className="text-[var(--color-text-muted)]">{section}</li>
            </>
          )}
          <li aria-hidden>
            <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />
          </li>
          <li
            aria-current="page"
            className="min-w-0 max-w-[18rem] truncate font-medium text-[var(--color-text-secondary)]"
          >
            {title}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <header>
        {section && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            {section}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {badge && (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                badge === "Beta" && "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                badge === "Roadmap" && "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                badge === "New" && "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              )}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="mt-3 text-lg leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      </header>

      {/* On this page — client component with scroll-spy */}
      {toc && toc.length > 0 && <DocToc toc={toc} />}

      {/* Body */}
      <div className="mt-10 space-y-12">{children}</div>

      {/* Prev / next pager */}
      {(prev || next) && (
        <nav
          aria-label="Pagination"
          className="mt-16 grid grid-cols-1 gap-4 border-t border-[var(--color-border)] pt-8 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={prev.link.href}
              rel="prev"
              className="card group flex items-center gap-3 p-4 transition-all hover:border-cyan-500/40 hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)] transition-all group-hover:-translate-x-0.5 group-hover:text-cyan-500" />
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Previous
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold transition-colors group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                  {prev.link.title}
                </span>
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <Link
              href={next.link.href}
              rel="next"
              className="card group flex items-center justify-end gap-3 p-4 text-right transition-all hover:border-cyan-500/40 hover:shadow-md"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Next
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold transition-colors group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                  {next.link.title}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-cyan-500" />
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}

// ─── Prose primitives ────────────────────────────────────────
// Server-friendly building blocks so every doc page reads the same. Authors
// compose these instead of re-styling raw elements.

export function DocSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight sm:text-2xl">
        <span className="h-1 w-1 rounded-full bg-cyan-500" />
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function DocSubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--color-border)] pl-5">
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

export function DocP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed text-[var(--color-text-secondary)]">{children}</p>
  );
}

export function DocList({ items, ordered }: { items: React.ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "space-y-2 text-[15px] leading-relaxed text-[var(--color-text-secondary)]",
        ordered ? "list-decimal pl-5" : ""
      )}
    >
      {items.map((item, i) => (
        <li key={i} className={ordered ? "" : "flex gap-2.5"}>
          {!ordered && <span className="mt-0.5 shrink-0 text-cyan-500">&bull;</span>}
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </Tag>
  );
}

export function DocCode({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#09090b]">
      {label && (
        <div className="border-b border-white/5 bg-white/[0.02] px-4 py-2 font-mono text-[11px] text-white/40">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-cyan-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const NOTE_STYLES = {
  info: { wrap: "border-cyan-500/20 bg-cyan-500/5", icon: "text-cyan-500", Icon: Info },
  warning: { wrap: "border-amber-500/25 bg-amber-500/5", icon: "text-amber-500", Icon: AlertTriangle },
  security: { wrap: "border-violet-500/25 bg-violet-500/5", icon: "text-violet-500", Icon: Lock },
} as const;

export function DocNote({
  type = "info",
  title,
  children,
}: {
  type?: keyof typeof NOTE_STYLES;
  title?: string;
  children: React.ReactNode;
}) {
  const { wrap, icon, Icon } = NOTE_STYLES[type];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", wrap)}>
      <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", icon)} />
      <div className="min-w-0 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
        {title && <p className="mb-1 font-semibold text-[var(--color-text)]">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function DocTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-surface)]">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 align-top text-[var(--color-text-secondary)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
