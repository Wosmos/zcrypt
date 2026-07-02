"use client";

import { NotificationCenter } from "@/components/ui/notification-center";
import { AvatarDropdown } from "@/components/ui/avatar-dropdown";
import { Logo } from "@/components/ui/logo";
import { VaultLock } from "@/components/ui/vault-lock";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";

export function TopBar() {
  // The one app-wide vault lock (provider lives in the app layout). On MOBILE the
  // toggle lives here, left of notifications (the vault page header carries it on
  // desktop). Wrapped in sm:hidden so desktop TopBar is untouched.
  const vault = useVaultLockContext();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-2">
      {/* Left — logo on mobile (the global search bar was removed; the per-page
          file search lives in the page header, and ⌘K still opens the palette). */}
      <div className="flex min-w-0 flex-1 items-center">
        <Logo size="lg" iconOnly href="/dashboard" className="sm:hidden" />
      </div>

      {/* Right — vault lock (mobile only), notification + avatar, pinned right */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <div className="sm:hidden">
          <VaultLock
            unlocked={vault.unlocked}
            remainingSeconds={vault.remainingSeconds}
            persistent={vault.persistent}
            modalOpen={vault.modalProps.open}
            onUnlock={() => vault.unlock()}
            onLock={vault.lock}
            className="h-10 w-10 justify-center rounded-full px-0"
          />
        </div>
        <NotificationCenter />
        <AvatarDropdown />
      </div>
    </header>
  );
}
