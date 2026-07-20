"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav, type DocsNavGroup, type DocsNavLink } from "@/lib/data";
import { cn } from "@/lib/utils";
import { ChevronRight, ExternalLink, Github, Heart, Menu, Search, X } from "@/lib/icons";
import { DocsSearchTrigger, useDocsSearch } from "@/components/docs/docs-search";

// ─── Badge styles ─────────────────────────────────────────────
const BADGE_STYLES: Record<NonNullable<DocsNavLink["badge"]>, string> = {
  Beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Roadmap: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  New: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

// ─── Individual tree link ─────────────────────────────────────
// Each link is a branch off the group's trunk: a vertical segment (half-height
// on the last child, closing the └ shape) plus a horizontal stub reaching the
// label. The active branch is tinted cyan and ends in a dot.
function TreeLink({
  link,
  active,
  isLast,
  onNavigate,
}: {
  link: DocsNavLink;
  active: boolean;
  isLast: boolean;
  onNavigate: () => void;
}) {
  const className = cn(
    "group/link relative flex w-full items-center gap-2 rounded-md py-1.5 pl-5 pr-2 text-[13px] transition-colors",
    active
      ? "bg-cyan-500/10 font-medium text-cyan-700 dark:text-cyan-300"
      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)]"
  );

  const label = (
    <>
      {/* Trunk segment: full height (├), half height on the last child (└) */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 w-px bg-[var(--color-border)]",
          isLast ? "h-1/2" : "h-full"
        )}
      />
      {/* Branch stub from the trunk to the label */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 transition-colors",
          active
            ? "bg-cyan-500"
            : "bg-[var(--color-border)] group-hover/link:bg-[var(--color-border-hover)]"
        )}
      />
      {/* Dot at the branch tip — cyan when active */}
      <span
        aria-hidden
        className={cn(
          "absolute left-3 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full transition-colors",
          active
            ? "bg-cyan-500"
            : "bg-[var(--color-border)] group-hover/link:bg-[var(--color-border-hover)]"
        )}
      />
      <span className="min-w-0 flex-1 truncate">{link.title}</span>
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

  if (link.external) {
    return (
      <a href={link.href} className={className} onClick={onNavigate}>
        {label}
      </a>
    );
  }

  return (
    <Link
      href={link.href}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}

// ─── Collapsible group ───────────────────────────────────────
function NavGroup({
  group,
  pathname,
  onNavigate,
}: {
  group: DocsNavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  const hasActive = group.links.some((l) => !l.external && l.href === pathname);
  // Every group starts expanded so the full tree (and every page in it) is
  // visible without hunting; users can still collapse groups they don't want.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (group.links.some((l) => !l.external && l.href === pathname)) setOpen(true);
  }, [pathname, group.links]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
          hasActive
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 flex-shrink-0 transition-transform duration-200",
            open && "rotate-90"
          )}
        />
        {group.title}
      </button>

      {/* Smooth height via the grid-rows 0fr → 1fr trick */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Branches hang off a trunk aligned under the chevron; each link
              draws its own trunk segment so the last one closes as └ */}
          <ul className="ml-[13px] flex list-none flex-col py-1">
            {group.links.map((link, i) => (
              <li key={link.href + link.title} className="relative">
                <TreeLink
                  link={link}
                  active={!link.external && pathname === link.href}
                  isLast={i === group.links.length - 1}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Nav tree ────────────────────────────────────────────────
function NavTree({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Documentation">
      <ul className="flex list-none flex-col gap-0.5">
        {docsNav.map((group) => (
          <li key={group.title}>
            <NavGroup group={group} pathname={pathname} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Pinned footer card ──────────────────────────────────────
// Fills the dead space at the bottom of the tree with a compact, quiet
// "open source" card — a natural footer to the vault, not a billboard.
function SidebarFooterCard() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text)]">
        Open source
      </p>
      <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-muted)]">
        MIT-licensed · your keys, your storage
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <a
          href="https://github.com/Wosmos/zcrypt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
        >
          <Github className="h-3.5 w-3.5" />
          GitHub
        </a>
        <a
          href="https://github.com/sponsors/Wosmos"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
        >
          <Heart className="h-3.5 w-3.5" />
          Sponsor
        </a>
      </div>
    </div>
  );
}

// ─── Desktop sidebar (hidden on mobile) ─────────────────────
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[268px] flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
      {/* Header: label + search trigger — DocsTopBar (h-14) sits above this,
          so no extra top offset is needed here. */}
      <div className="border-b border-[var(--color-border)] px-4 pb-4 pt-6">
        <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          Documentation
        </p>
        <div className="mt-3">
          <DocsSearchTrigger />
        </div>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavTree pathname={pathname} onNavigate={() => {}} />
      </div>

      {/* Pinned footer card — fills the dead space at the bottom */}
      <div className="mt-auto border-t border-[var(--color-border)] p-3">
        <SidebarFooterCard />
      </div>
    </aside>
  );
}

// ─── Mobile nav (hidden on desktop) ─────────────────────────
export function DocsMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { open: openSearch } = useDocsSearch();

  const currentGroup = docsNav.find((g) =>
    g.links.some((l) => !l.external && l.href === pathname)
  );

  return (
    <>
      {/* Sticky bar below the main navbar */}
      <div className="sticky top-14 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur-sm lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open docs navigation"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <Menu className="h-4 w-4" />
        </button>
        {currentGroup && (
          <>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--color-text-secondary)]">
              {currentGroup.title}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search docs"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Slide-in drawer — full viewport height, over the top bar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-[var(--color-border)] px-4 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-[var(--color-text)]">Documentation</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2">
            <DocsSearchTrigger onBeforeOpen={() => setOpen(false)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavTree pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
        <div className="mt-auto border-t border-[var(--color-border)] p-3">
          <SidebarFooterCard />
        </div>
      </aside>
    </>
  );
}
