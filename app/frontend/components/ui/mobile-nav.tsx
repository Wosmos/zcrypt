"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, type ComponentType } from "react";
import { motion, LayoutGroup, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { usePreferencesStore } from "@/store/preferences";
import { useAuthStore } from "@/store/auth";
import { logout as logoutApi } from "@/lib/auth-api";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Cog, Users, LogOut, ArrowRight, BarChart3, Layers, Trash2 } from "@/lib/icons";
import { VaultIcon, GearIcon, MoreDotsIcon } from "@/components/icons/nav-icons";
import { Role } from "@/types";

// Primary tabs: kept to the essentials so the bar stays light. Share, Settings,
// Tools and Admin live in the "More" sheet instead of crowding the bar.
const NAV_LINKS = [
  { href: "/dashboard", label: "Vault", Icon: VaultIcon },
  { href: "/analytics", label: "Insights", Icon: BarChart3 },
  { href: "/spaces", label: "Spaces", Icon: Layers },
];

type DrawerLink = { href: string; label: string; icon: ComponentType<{ className?: string }> };

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const { user, refreshTokenValue, clearAuth } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduce = useReducedMotion();
  const spring = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const);

  const isAdmin = user?.role === Role.Admin;

  // Everything that isn't a primary tab lives in the More sheet. Share + Settings
  // are always here; Tools/Admin appear when relevant.
  const drawerLinks = useMemo<DrawerLink[]>(() => {
    const items: DrawerLink[] = [
      { href: "/settings", label: "Settings", icon: GearIcon },
      // Parity with the desktop sidebar's "Deleted Files", without this, a
      // mobile user has no way to reach /trash at all.
      { href: "/trash", label: "Deleted Files", icon: Trash2 },
    ];
    if (advancedMode) items.push({ href: "/tools", label: "Tools", icon: Cog });
    if (isAdmin) items.push({ href: "/admin", label: "Admin", icon: Users });
    return items;
  }, [advancedMode, isAdmin]);

  const handleLogout = async () => {
    try {
      // Always call, even with refreshTokenValue null (web, no refresh has
      // happened yet this session): authRequest sends credentials, so the
      // httpOnly cookie still reaches the backend and gets revoked/cleared.
      await logoutApi(refreshTokenValue, useAuthStore.getState().accessToken);
    } catch {
      /* ignore */
    }
    clearAuth();
    router.push("/login");
  };

  const isActive = (href: string) => {
    if (href === "/admin") return pathname.startsWith("/admin");
    if (href === "/tools") return pathname.startsWith("/tools");
    return pathname === href;
  };

  // "More" reads as active whenever you're on one of the pages it hosts.
  const moreActive = drawerLinks.some((l) => isActive(l.href));

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 select-none px-4 pb-[calc(var(--safe-bottom)+8px)] pt-4 [-webkit-tap-highlight-color:transparent] md:hidden"
      >
        <div className="pointer-events-auto mx-auto max-w-sm">
          <div
            className={cn(
              "relative flex items-stretch justify-around gap-0.5 overflow-hidden px-1.5 py-1",
              // Solid (not translucent + blur): a large blur under an always-on
              // fixed bar is a constant GPU cost on phones.
              "bg-[var(--color-surface)]",
              "border border-[var(--color-border)]",
              "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.30)]",
              "rounded-[28px]",
            )}
          >
            <LayoutGroup>
              {NAV_LINKS.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      if (!active) haptic(6);
                    }}
                    className={TAB}
                  >
                    <TabGlyph active={active} spring={spring}>
                      <Icon filled={active} className={glyphClass(active)} />
                    </TabGlyph>
                    <span className={labelClass(active)}>{label}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  setSheetOpen(true);
                }}
                aria-label="More"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                className={TAB}
              >
                <TabGlyph active={sheetOpen || moreActive} spring={spring}>
                  <MoreDotsIcon
                    filled={sheetOpen || moreActive}
                    className={glyphClass(sheetOpen || moreActive)}
                  />
                </TabGlyph>
                <span className={labelClass(sheetOpen || moreActive)}>More</span>
              </button>
            </LayoutGroup>
          </div>
        </div>
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <div className="space-y-1 pb-1">
          {/* Navigation. Share + Settings always; Tools/Admin when relevant. */}
          <div className="px-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Navigation
            </p>
          </div>
          {drawerLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => {
                haptic(6);
                setSheetOpen(false);
              }}
              className={cn(
                "mx-1 flex min-h-12 touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 transition-[background-color,transform] duration-150 active:scale-[0.98]",
                isActive(href)
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "text-[var(--color-text)] hover:bg-[var(--color-surface-1)]",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  isActive(href) ? "bg-[var(--color-accent)]/15" : "bg-[var(--color-surface-1)]",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            </Link>
          ))}

          {/* Log out (theme toggle lives in the avatar dropdown, not here). */}
          <div className="mx-3 my-2 border-t border-[var(--color-border)]" />
          <button
            onClick={() => {
              void handleLogout();
              setSheetOpen(false);
            }}
            className="mx-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-400 transition-colors hover:bg-red-500/10 active:scale-[0.98]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <LogOut className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Log out</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

const TAB =
  "group relative flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-[22px] py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60";

const glyphClass = (active: boolean) =>
  cn(
    "relative z-10 h-[22px] w-[22px] transition-colors duration-200",
    active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
  );

const labelClass = (active: boolean) =>
  cn(
    "text-[11px] leading-none tracking-tight transition-colors duration-200",
    active
      ? "font-semibold text-[var(--color-text)]"
      : "font-medium text-[var(--color-text-muted)]",
  );

/** Icon slot with the sliding pill indicator behind it and a press-down response. */
function TabGlyph({
  active,
  spring,
  children,
}: {
  active: boolean;
  spring: object;
  children: React.ReactNode;
}) {
  return (
    <span className="relative flex h-8 w-14 items-center justify-center transition-transform duration-150 ease-out group-active:scale-90">
      {active ? (
        <motion.span
          layoutId="mobile-nav-pill"
          className="absolute inset-0 rounded-full bg-[var(--color-accent)]/15"
          transition={spring}
        />
      ) : null}
      {children}
    </span>
  );
}
