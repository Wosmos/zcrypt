"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav, type DocsNavGroup, type DocsNavLink } from "@/lib/data";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, Menu, X } from "@/lib/icons";

// ─── Badge styles ─────────────────────────────────────────────
const BADGE_STYLES: Record<NonNullable<DocsNavLink["badge"]>, string> = {
  Beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Roadmap: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  New: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

// ─── Individual link ─────────────────────────────────────────
function SidebarLink({
  link,
  active,
  onNavigate,
}: {
  link: DocsNavLink;
  active: boolean;
  onNavigate: () => void;
}) {
  const className = cn(
    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
    active
      ? "bg-cyan-500/10 font-medium text-cyan-700 dark:text-cyan-300"
      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
  );

  const label = (
    <>
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
    return <a href={link.href} className={className} onClick={onNavigate}>{label}</a>;
  }

  return (
    <Link href={link.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {label}
    </Link>
  );
}

// ─── Collapsible group ───────────────────────────────────────
function NavGroup({
  group,
  pathname,
  onNavigate,
  isFirst,
}: {
  group: DocsNavGroup;
  pathname: string;
  onNavigate: () => void;
  isFirst: boolean;
}) {
  const hasActive = group.links.some((l) => !l.external && l.href === pathname);
  const [open, setOpen] = useState(() => hasActive || group.title === "Getting Started");

  useEffect(() => {
    if (group.links.some((l) => !l.external && l.href === pathname)) setOpen(true);
  }, [pathname, group.links]);

  return (
    <div className={cn(!isFirst && "border-t border-[var(--color-border)] pt-2 mt-2")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        {group.title}
        <ChevronDown
          className={cn("h-3 w-3 flex-shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {/* Left rail + links */}
        <ul className="ml-2.5 mt-1 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-2 pb-1 list-none">
          {group.links.map((link) => (
            <li key={link.href + link.title}>
              <SidebarLink
                link={link}
                active={!link.external && pathname === link.href}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Nav tree ────────────────────────────────────────────────
function NavTree({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Documentation">
      <ul className="flex flex-col list-none">
        {docsNav.map((group, i) => (
          <li key={group.title}>
            <NavGroup group={group} pathname={pathname} onNavigate={onNavigate} isFirst={i === 0} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Desktop sidebar (hidden on mobile) ─────────────────────
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[268px] flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
      {/* "Documentation" header */}
      <div className="border-b border-[var(--color-border)] px-5 pb-4 pt-24">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          Documentation
        </p>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavTree pathname={pathname} onNavigate={() => {}} />
      </div>
    </aside>
  );
}

// ─── Mobile nav (hidden on desktop) ─────────────────────────
export function DocsMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const currentGroup = docsNav.find((g) =>
    g.links.some((l) => !l.external && l.href === pathname)
  );

  return (
    <>
      {/* Sticky bar below the main navbar */}
      <div className="sticky top-16 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 px-4 py-2.5 backdrop-blur-sm lg:hidden">
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
            <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
              {currentGroup.title}
            </span>
          </>
        )}
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Slide-in drawer */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-16 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
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
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavTree pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      </aside>
    </>
  );
}
