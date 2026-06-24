"use client";

import { usePathname } from "next/navigation";
import { NotificationCenter } from "@/components/ui/notification-center";
import { AvatarDropdown } from "@/components/ui/avatar-dropdown";
import { useCommandPalette } from "@/components/ui/command-palette";
import { Search } from "@/lib/icons";

const TITLES: Record<string, string> = {
  "/dashboard": "My Vault",
  "/share": "Share",
  "/settings": "Settings",
  "/tools": "Tools",
  "/admin": "Admin",
  "/transfer": "Transfer",
  "/analytics": "Analytics",
};

function getTitle(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  for (const [key, title] of Object.entries(TITLES)) {
    if (pathname.startsWith(key + "/")) return title;
  }
  return "zcrypt";
}

export function TopBar() {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const openCommand = useCommandPalette((s) => s.setOpen);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-1">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="text-[var(--color-text-muted)]">Home</span>
        <span className="text-[var(--color-text-muted)]/60" aria-hidden>
          /
        </span>
        <span className="truncate font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </span>
      </nav>

      <div className="flex items-center gap-2">
        {/* Search affordance (command palette — wired in a later pass) */}
        <button
          type="button"
          onClick={() => openCommand(true)}
          className="hidden h-9 w-56 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-hover)] sm:flex"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
            ⌘K
          </kbd>
        </button>

        <NotificationCenter />
        <AvatarDropdown />
      </div>
    </header>
  );
}
