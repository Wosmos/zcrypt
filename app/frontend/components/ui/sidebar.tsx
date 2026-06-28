"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { cn, formatBytes } from "@/lib/utils";
import { Role } from "@/types";
import { usePreferencesStore } from "@/store/preferences";
import {
  Settings,
  Shield,
  PanelLeftClose,
  PanelLeft,
  Database,
  Users,
  Share2,
  Cog,
  Trash2,
  BarChart3,
} from "@/lib/icons";
import { Logo } from "@/components/ui/logo";
import { MobileNav } from "@/components/ui/mobile-nav";
import { useAuthStore } from "@/store/auth";
import { useQuotaStore } from "@/store/quota";

const primaryLinks = [
  { href: "/dashboard", label: "Vault", icon: Shield },
  { href: "/analytics", label: "Insights", icon: BarChart3 },
  { href: "/share", label: "Share", icon: Share2 },
];

const advancedLink = { href: "/tools", label: "Tools", icon: Cog };
const adminLink = { href: "/admin", label: "Admin", icon: Users };
const settingsLink = { href: "/settings", label: "Settings", icon: Settings };
const trashLink = { href: "/trash", label: "Deleted Files", icon: Trash2 };

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const [collapsed, setCollapsed] = useState(false);
  const quota = useQuotaStore((s) => s.quota);

  const isAdmin = user?.role === Role.Admin;
  const secondaryLinks = useMemo(() => {
    const items = [settingsLink, trashLink];
    if (advancedMode) items.push(advancedLink);
    if (isAdmin) items.push(adminLink);
    return items;
  }, [isAdmin, advancedMode]);

  // Storage stats from user quota
  const isUnlimited = quota?.is_unlimited ?? false;
  const totalUsed = quota?.used_bytes ?? 0;
  const totalMax = quota && !quota.is_unlimited && quota.quota_bytes > 0 ? quota.quota_bytes : 0;
  const storagePercent = totalMax > 0 ? Math.min((totalUsed / totalMax) * 100, 100) : 0;

  const isActive = (href: string) => {
    if (href === "/admin") return pathname.startsWith("/admin");
    if (href === "/tools") return pathname.startsWith("/tools");
    if (href === "/settings") return pathname.startsWith("/settings");
    return pathname === href;
  };

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Shield }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150",
          collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
          active
            ? "bg-[var(--shell-active)] text-[var(--shell-active-text)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] flex-shrink-0 transition-colors",
            active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
          )}
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar — floating panel */}
      <aside
        className={cn(
          "panel hidden shrink-0 flex-col p-3 transition-all duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-[244px]"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center px-1.5 pb-3 pt-1", collapsed && "justify-center px-0")}>
          <Logo
            size={collapsed ? "xs" : "md"}
            iconOnly={collapsed}
            subtitle={collapsed ? undefined : "encrypted vault"}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {primaryLinks.map((link) => (
            <NavItem key={link.href} {...link} />
          ))}

          <div className={cn("pt-4", collapsed && "flex justify-center")}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Account
              </p>
            )}
          </div>
          {secondaryLinks.map((link) => (
            <NavItem key={link.href} {...link} />
          ))}
        </nav>

        {/* Storage card */}
        <div className="pt-3">
          {!collapsed ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                  <Database className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                  Storage
                </span>
                <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                  {isUnlimited ? "∞" : totalMax > 0 ? `${storagePercent.toFixed(0)}%` : "—"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                {totalMax > 0 && (
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-[var(--color-accent)]"
                    )}
                    style={{ width: `${storagePercent}%` }}
                  />
                )}
                {isUnlimited && <div className="h-full w-full rounded-full bg-[var(--color-accent)]/60" />}
              </div>
              <p className="mt-2 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                {isUnlimited
                  ? `${formatBytes(totalUsed)} used`
                  : totalMax > 0
                    ? `${formatBytes(totalUsed)} of ${formatBytes(totalMax)}`
                    : "No platform connected"}
              </p>
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-1.5"
              title={isUnlimited ? `${formatBytes(totalUsed)} used` : totalMax > 0 ? `${formatBytes(totalUsed)} / ${formatBytes(totalMax)}` : "No platform"}
            >
              <Database className="h-4 w-4 text-[var(--color-text-muted)]" />
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className={cn("mt-2 flex border-t border-[var(--color-border)] pt-2", collapsed ? "justify-center" : "justify-end")}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-secondary)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <MobileNav />
    </>
  );
}
