"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { usePreferencesStore } from "@/store/preferences";
import { useAuthStore } from "@/store/auth";
import { logout as logoutApi } from "@/lib/auth-api";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  Shield,
  FileText,
  Share2,
  Settings,
  Cog,
  Users,
  MoreHorizontal,
  Sun,
  Moon,
  LogOut,
} from "@/lib/icons";
import { Role } from "@/types";

const normalLinks = [
  { href: "/dashboard", label: "Vault", icon: Shield },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/share", label: "Share", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const advancedLink = { href: "/tools", label: "Tools", icon: Cog };
const adminLink = { href: "/admin", label: "Admin", icon: Users };

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const { user, refreshTokenValue, clearAuth } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdmin = user?.role === Role.Admin;
  const showMore = advancedMode || isAdmin;

  // Items shown in the bottom bar
  const barLinks = normalLinks;

  // Overflow items shown in the drawer
  const drawerLinks = useMemo(() => {
    const items: typeof normalLinks = [];
    if (advancedMode) items.push(advancedLink);
    if (isAdmin) items.push(adminLink);
    return items;
  }, [advancedMode, isAdmin]);

  const handleLogout = async () => {
    try {
      if (refreshTokenValue) await logoutApi(refreshTokenValue);
    } catch { /* ignore */ }
    clearAuth();
    router.push("/login");
  };

  const isActive = (href: string) => {
    if (href === "/admin") return pathname.startsWith("/admin");
    if (href === "/tools") return pathname.startsWith("/tools");
    return pathname === href;
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around px-2 py-1.5">
          {barLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0",
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)]"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
          {showMore && (
            <button
              onClick={() => setSheetOpen(true)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors",
                sheetOpen ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Bottom sheet drawer */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <div className="space-y-1">
          {/* Overflow nav links */}
          {drawerLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSheetOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                  active
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface-1)]"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
              </Link>
            );
          })}

          {/* Divider */}
          <div className="border-t border-[var(--color-border)] my-2" />

          {/* Theme toggle */}
          <button
            onClick={() => { toggleTheme(); setSheetOpen(false); }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--color-text)] hover:bg-[var(--color-surface-1)] transition-colors w-full"
          >
            {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="text-sm font-medium">{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>

          {/* Logout */}
          <button
            onClick={() => { handleLogout(); setSheetOpen(false); }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors w-full"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
