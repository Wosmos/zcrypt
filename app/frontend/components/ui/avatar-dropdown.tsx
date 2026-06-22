"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuthStore } from "@/store/auth";
import { usePreferencesStore } from "@/store/preferences";
import { logout as logoutApi } from "@/lib/auth-api";
import {
  Sun,
  Moon,
  LogOut,
  Settings,
  Cog,
} from "@/lib/icons";
import { Role } from "@/types";
import Link from "next/link";

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={cn(
        "relative inline-flex h-[22px] w-[40px] flex-shrink-0 rounded-full transition-colors duration-200",
        enabled ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-[3px] left-[3px] inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          enabled ? "translate-x-[18px]" : "translate-x-0"
        )}
      />
    </div>
  );
}

export function AvatarDropdown() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, refreshTokenValue, clearAuth } = useAuthStore();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const setAdvancedMode = usePreferencesStore((s) => s.setAdvancedMode);

  const isAdmin = user?.role === Role.Admin;
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleLogout = async () => {
    try {
      if (refreshTokenValue) await logoutApi(refreshTokenValue);
    } catch { /* ignore */ }
    clearAuth();
    router.push("/login");
  };

  if (!user) return null;

  const initial = (user.username?.[0] || user.email[0]).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Compact round avatar button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-full transition-all",
          "bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-xs font-bold",
          "hover:bg-[var(--color-accent)]/25",
          open && "ring-2 ring-[var(--color-accent)]/30"
        )}
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl shadow-black/10 z-50 overflow-hidden"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold truncate">{user.username}</p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">{user.email}</p>
              {isAdmin && (
                <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-amber-500/15 text-amber-500">
                  Admin
                </span>
              )}
            </div>

            {/* Menu items */}
            <div className="py-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <Settings className="h-4 w-4 text-[var(--color-text-muted)]" />
                Settings
              </Link>

              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <span className="flex items-center gap-3">
                  {isDark ? (
                    <Moon className="h-4 w-4 text-[var(--color-text-muted)]" />
                  ) : (
                    <Sun className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                  Dark Mode
                </span>
                <ToggleSwitch enabled={isDark} />
              </button>

              {/* Advanced mode toggle */}
              <button
                onClick={() => setAdvancedMode(!advancedMode)}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Cog className="h-4 w-4 text-[var(--color-text-muted)]" />
                  Advanced
                </span>
                <ToggleSwitch enabled={advancedMode} />
              </button>
            </div>

            {/* Logout */}
            <div className="border-t border-[var(--color-border)] py-1">
              <button
                onClick={() => { handleLogout(); setOpen(false); }}
                aria-label="Log out"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
