"use client";

import { NotificationCenter } from "@/components/ui/notification-center";
import { AvatarDropdown } from "@/components/ui/avatar-dropdown";
import { Logo } from "@/components/ui/logo";

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-1">
      {/* Left — logo on mobile (the global search bar was removed; the per-page
          file search lives in the page header, and ⌘K still opens the palette). */}
      <div className="flex min-w-0 flex-1 items-center">
        <Logo size="xs" iconOnly href="/dashboard" className="sm:hidden" />
      </div>

      {/* Right — notification + avatar, always pinned right */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <NotificationCenter />
        <AvatarDropdown />
      </div>
    </header>
  );
}
