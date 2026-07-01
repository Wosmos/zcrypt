import { Sidebar } from "@/components/ui/sidebar";
import { TopBar } from "@/components/ui/top-bar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { CommandPalette } from "@/components/ui/command-palette";
import { VaultLockProvider } from "@/components/providers/vault-lock-provider";
import { AppScope } from "@/components/providers/app-scope";
import { AppTransfers } from "@/components/transfer/app-transfers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Marks <html data-app> so color themes engage for the app (and its
          portaled overlays) but never for marketing/auth pages. Mounted
          outside AuthGuard so data-app is set during the auth spinner —
          before the shell ever paints — avoiding any unthemed flash. */}
      <AppScope />
      <AuthGuard>
      {/* One vault-unlock instance + one PassphraseModal for the whole app, so the
          Vault page (header pill + decrypt actions) and the docked transfer
          manager (resume/retry) share the same lock. */}
      <VaultLockProvider>
        {/* Floating-panel shell: neutral canvas with padding + gap so the
            sidebar and content read as separate cards (light-first redesign). */}
        <div className="app-shell flex h-dvh gap-2.5 bg-[var(--color-bg)] p-2.5 md:gap-3 md:p-3">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 md:gap-3">
            <TopBar />
            <main
              id="main-content"
              className="panel min-h-0 flex-1 overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
            >
              <div className="mx-auto max-w-9xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                {children}
              </div>
            </main>
          </div>
          {/* Unified transfer manager — docked bottom-right, persists across
              navigation (stores are singletons). Renders null when idle. */}
          <AppTransfers />
        </div>
        <CommandPalette />
      </VaultLockProvider>
      </AuthGuard>
    </>
  );
}
