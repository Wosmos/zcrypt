import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Sparkles,
  Rocket,
  FolderOpen,
  Shield,
  HardDrive,
  Share2,
  Send,
  Eye,
  Key,
  Smartphone,
  Code,
  FileText,
} from "@/lib/icons";
import { docsNav, type DocsNavGroup, type DocsNavLink } from "@/lib/data";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
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

// Each group reads like a folder in the vault: a themed icon tile keyed to the
// docs section color map, then the group's pages as a tidy list of rows.
type GroupMeta = { icon: ComponentType<{ className?: string }>; tile: string; text: string };
const GROUP_META: Record<string, GroupMeta> = {
  "Getting Started": { icon: Rocket, tile: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
  "Organizing files": { icon: FolderOpen, tile: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
  Security: { icon: Shield, tile: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  "Storage backends": { icon: HardDrive, tile: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  "Sharing & sending": { icon: Share2, tile: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  Transfers: { icon: Send, tile: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  "Privacy tools": { icon: Eye, tile: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  Account: { icon: Key, tile: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  Apps: { icon: Smartphone, tile: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
  Developers: { icon: Code, tile: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  Reference: {
    icon: FileText,
    tile: "bg-[var(--color-surface-1)]",
    text: "text-[var(--color-text-muted)]",
  },
};

const FALLBACK_META: GroupMeta = {
  icon: FileText,
  tile: "bg-[var(--color-surface-1)]",
  text: "text-[var(--color-text-muted)]",
};

function GroupLinkRow({ link }: { link: DocsNavLink }) {
  const inner = (
    <>
      <span className="min-w-0 truncate">{link.title}</span>
      {link.badge && (
        <span
          className={cn(
            "flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
            BADGE_STYLES[link.badge]
          )}
        >
          {link.badge}
        </span>
      )}
      {link.external && (
        <ExternalLink className="h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]" />
      )}
    </>
  );

  const className =
    "flex items-center gap-2 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:text-cyan-600 dark:hover:text-cyan-400";

  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {inner}
    </Link>
  );
}

// A documentation-index section: an icon + title header, then the group's
// pages as a plain indented list hanging off a guide line — the same tree
// language as the sidebar, laid out in balanced columns so uneven page
// counts never leave empty boxes.
function GroupBlock({ group }: { group: DocsNavGroup }) {
  const meta = GROUP_META[group.title] ?? FALLBACK_META;
  const Icon = meta.icon;

  return (
    <section className="mb-9 break-inside-avoid">
      <div className="mb-1 flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
            meta.tile
          )}
        >
          <Icon className={cn("h-4 w-4", meta.text)} />
        </div>
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide">
          {group.title}
        </h2>
      </div>
      <p className="mb-2 pl-[38px] text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        {group.summary}
      </p>
      <ul className="ml-[13px] flex list-none flex-col border-l border-[var(--color-border)] pl-3">
        {group.links.map((link) => (
          <li key={link.href + link.title}>
            <GroupLinkRow link={link} />
          </li>
        ))}
      </ul>
    </section>
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
        <div className="mt-6 inline-flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-muted)]">New here?</span>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1 font-semibold text-cyan-600 transition-all hover:gap-2 dark:text-cyan-400"
          >
            Start with the Quickstart
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Continuous table of contents — every group stacked top to bottom,
          its pages nested underneath, as one flowing outline */}
      <div className="max-w-2xl">
        {docsNav.map((group) => (
          <GroupBlock key={group.title} group={group} />
        ))}
      </div>

      {/* Help CTA */}
      <section className="mt-14 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
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
