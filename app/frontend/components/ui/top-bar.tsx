"use client";

import { NotificationCenter } from "@/components/ui/notification-center";
import { AvatarDropdown } from "@/components/ui/avatar-dropdown";
import { useCommandPalette } from "@/components/ui/command-palette";
import { Logo } from "@/components/ui/logo";
import { Search } from "@/lib/icons";

export function TopBar() {
  const openCommand = useCommandPalette((s) => s.setOpen);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-1">
      {/* Left — logo on mobile, search bar on sm+ */}
      <div className="flex min-w-0 flex-1 items-center">
        {/* Logo: mobile only */}
        <Logo size="xs" iconOnly href="/dashboard" className="sm:hidden" />

        {/* Search: desktop only */}
        <button
          type="button"
          onClick={() => openCommand(true)}
          className="hidden h-10 w-96 items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text-muted)] shadow-sm transition-all hover:border-[var(--color-accent)]/40 hover:shadow-[0_0_0_3px_rgba(0,213,228,0.06)] sm:flex"
          aria-label="Search"
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 font-mono text-[10px] leading-none text-[var(--color-text-muted)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right — notification + avatar, always pinned right */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <NotificationCenter />
        <AvatarDropdown />
      </div>
    </header>
  );
}
