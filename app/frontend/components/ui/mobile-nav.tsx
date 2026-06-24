"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { motion, LayoutGroup } from "motion/react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { usePreferencesStore } from "@/store/preferences";
import { useAuthStore } from "@/store/auth";
import { logout as logoutApi } from "@/lib/auth-api";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  Cog,
  Users,
  Sun,
  Moon,
  LogOut,
  Send,
  FileText,
  ArrowRight,
} from "@/lib/icons";
import {
  VaultIcon,
  ShareIcon,
  GearIcon,
  MoreDotsIcon,
} from "@/components/icons/nav-icons";
import { Role } from "@/types";

const NAV_LINKS = [
  { href: "/dashboard", label: "Vault", Icon: VaultIcon },
  { href: "/share", label: "Share", Icon: ShareIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const { user, refreshTokenValue, clearAuth } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdmin = user?.role === Role.Admin;
  const showMore = advancedMode || isAdmin;

  const drawerLinks = useMemo(() => {
    const items: { href: string; label: string; icon: typeof Cog }[] = [];
    if (advancedMode) items.push({ href: "/tools", label: "Tools", icon: Cog });
    if (isAdmin) items.push({ href: "/admin", label: "Admin", icon: Users });
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
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4 pb-[calc(env(safe-area-inset-bottom,8px)+8px)] pt-4 pointer-events-none"
      >
        <div className="mx-auto max-w-md pointer-events-auto">
          <div
            className={cn(
              "relative overflow-hidden p-1.5 flex items-center justify-around",
              "bg-[var(--color-surface)]/85 backdrop-blur-2xl",
              "border border-[var(--color-border)]/50",
              "shadow-lg shadow-black/10",
              "rounded-[22px]"
            )}
          >
            <LayoutGroup>
              {NAV_LINKS.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className="relative flex-1 group"
                  >
                    <div className="relative z-10 flex flex-col items-center justify-center py-2 transition-transform duration-200 active:scale-90">
                      <motion.div
                        animate={{
                          y: active ? -2 : 0,
                          scale: active ? 1.1 : 1,
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <Icon
                          filled={active}
                          className={cn(
                            "h-5 w-5 transition-colors duration-300",
                            active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
                          )}
                        />
                      </motion.div>
                      <span
                        className={cn(
                          "text-[10px] font-bold mt-1 tracking-tight transition-colors duration-300",
                          active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
                        )}
                      >
                        {label}
                      </span>
                    </div>

                    {active && (
                      <motion.div
                        layoutId="active-bg"
                        className="absolute inset-0 bg-[var(--color-accent)]/[0.08] rounded-[16px]"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}

              {showMore && (
                <button
                  onClick={() => setSheetOpen(true)}
                  className="relative flex-1 group active:scale-90 transition-transform"
                >
                  <div className="relative z-10 flex flex-col items-center justify-center py-2">
                    <MoreDotsIcon
                      filled={sheetOpen}
                      className={cn(
                        "h-5 w-5 transition-colors duration-300",
                        sheetOpen ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-bold mt-1 tracking-tight transition-colors duration-300",
                        sheetOpen ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
                      )}
                    >
                      More
                    </span>
                  </div>
                  {sheetOpen && (
                    <motion.div
                      layoutId="active-bg"
                      className="absolute inset-0 bg-[var(--color-accent)]/[0.08] rounded-[16px]"
                    />
                  )}
                </button>
              )}
            </LayoutGroup>
          </div>
        </div>
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <div className="space-y-1 pb-1">
          {/* Quick actions */}
          <div className="px-3 pb-1">
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Quick Actions</p>
          </div>
          <div className="grid grid-cols-3 gap-2 px-1">
            <Link
              href="/send"
              onClick={() => setSheetOpen(false)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[var(--color-surface-1)] hover:bg-[var(--color-accent)]/10 transition-colors active:scale-95"
            >
              <Send className="h-4.5 w-4.5 text-[var(--color-accent)]" />
              <span className="text-[11px] font-semibold text-[var(--color-text)]">Send File</span>
            </Link>
            <Link
              href="/pad"
              onClick={() => setSheetOpen(false)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[var(--color-surface-1)] hover:bg-[var(--color-accent)]/10 transition-colors active:scale-95"
            >
              <FileText className="h-4.5 w-4.5 text-[var(--color-accent)]" />
              <span className="text-[11px] font-semibold text-[var(--color-text)]">Text Pad</span>
            </Link>
            <Link
              href="/transfer"
              onClick={() => setSheetOpen(false)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[var(--color-surface-1)] hover:bg-[var(--color-accent)]/10 transition-colors active:scale-95"
            >
              <ArrowRight className="h-4.5 w-4.5 text-[var(--color-accent)]" />
              <span className="text-[11px] font-semibold text-[var(--color-text)]">Transfer</span>
            </Link>
          </div>

          {/* Navigation links */}
          {drawerLinks.length > 0 && (
            <>
              <div className="border-t border-[var(--color-border)] mx-3 my-2" />
              <div className="px-3 pb-1">
                <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Navigation</p>
              </div>
              {drawerLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex items-center gap-3 mx-1 px-3 py-2.5 rounded-xl transition-colors active:scale-[0.98]",
                    isActive(href)
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-1)]"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-lg",
                    isActive(href) ? "bg-[var(--color-accent)]/15" : "bg-[var(--color-surface-1)]"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </Link>
              ))}
            </>
          )}

          {/* Theme & Logout */}
          <div className="border-t border-[var(--color-border)] mx-3 my-2" />
          <button
            onClick={() => { toggleTheme(); setSheetOpen(false); }}
            className="flex items-center gap-3 mx-1 px-3 py-2.5 rounded-xl text-[var(--color-text)] hover:bg-[var(--color-surface-1)] transition-colors w-full active:scale-[0.98]"
          >
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-surface-1)]">
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium">
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>
          <button
            onClick={() => { handleLogout(); setSheetOpen(false); }}
            className="flex items-center gap-3 mx-1 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors w-full active:scale-[0.98]"
          >
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-red-500/10">
              <LogOut className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Log out</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
