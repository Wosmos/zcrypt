"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Shield,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Database,
} from "lucide-react";

const LINKS = [
  { href: "/demo", label: "Vault", icon: Shield },
  { href: "#", label: "Analytics", icon: BarChart3 },
  { href: "#", label: "Settings", icon: Settings },
];

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex h-dvh">
      {/* Simplified sidebar (no auth) */}
      <aside className="hidden md:flex h-screen w-[232px] flex-col border-r bg-[var(--color-sidebar)] border-[var(--color-sidebar-border)]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-sidebar-border)]">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
            <Shield className="h-[16px] w-[16px] text-emerald-400" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-[var(--color-sidebar-text)] tracking-tight">
              zpush
            </p>
            <p className="text-[10px] text-[var(--color-sidebar-muted)] -mt-0.5">
              encrypted vault
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 cursor-default",
                  active
                    ? "bg-[var(--color-sidebar-active)] text-emerald-400"
                    : "text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)]",
                )}
              >
                <Icon
                  className={cn("h-[18px] w-[18px]", active && "text-emerald-400")}
                />
                {label}
              </div>
            );
          })}
        </nav>

        {/* Storage + footer */}
        <div className="px-4 py-4 border-t border-[var(--color-sidebar-border)] space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Database className="h-3 w-3 text-[var(--color-sidebar-muted)]" />
              <span className="text-[10px] font-medium text-[var(--color-sidebar-muted)]">
                16.4 GB / 50 GB
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: "33%",
                  background: "linear-gradient(90deg, #10b981, #34d399)",
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-sidebar-muted)]">
              zpush v0.2
            </span>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-7 w-7 rounded-lg text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] transition-colors"
            >
              {isDark ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        id="main-content"
        className="flex-1 overflow-y-auto bg-[var(--color-bg)]"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
