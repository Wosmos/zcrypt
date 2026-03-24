import { Sidebar } from "@/components/ui/sidebar";
import { TopBar } from "@/components/ui/top-bar";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-dvh">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main id="main-content" className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 md:pb-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
