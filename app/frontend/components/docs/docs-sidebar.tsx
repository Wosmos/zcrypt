"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav, type DocsNavLink } from "@/lib/data";
import { cn } from "@/lib/utils";
import { ExternalLink, PanelLeft, X } from "@/lib/icons";

const BADGE_STYLES: Record<NonNullable<DocsNavLink["badge"]>, string> = {
  Beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Roadmap: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  New: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

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
    "group flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
    active
      ? "bg-cyan-500/10 font-semibold text-cyan-700 dark:text-cyan-300"
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

function NavTree({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      {docsNav.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.links.map((link) => (
              <SidebarLink
                key={link.href + link.title}
                link={link}
                active={!link.external && pathname === link.href}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)]"
        >
          <PanelLeft className="h-4 w-4 text-cyan-500" />
          Browse documentation
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm font-bold">Documentation</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavTree pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sticky rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-10 pr-2">
          <NavTree pathname={pathname} onNavigate={() => {}} />
        </div>
      </aside>
    </>
  );
}
