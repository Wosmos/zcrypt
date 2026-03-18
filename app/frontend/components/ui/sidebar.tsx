"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useMemo } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn, formatBytes } from "@/lib/utils";
import { Role } from "@/types";
import { useTheme } from "@/components/providers/theme-provider";
import {
  Settings,
  Shield,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Database,
  Users,
} from "@/lib/icons";
import { Logo } from "@/components/ui/logo";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useQuotaStore } from "@/store/quota";
import { logout as logoutApi } from "@/lib/auth-api";

const baseLinks = [
  { href: "/dashboard", label: "Vault", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminLink = { href: "/admin", label: "Admin", icon: Users };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, refreshTokenValue, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const quota = useQuotaStore((s) => s.quota);

  const isAdmin = user?.role === Role.Admin;
  const links = useMemo(
    () => (isAdmin ? [...baseLinks, adminLink] : baseLinks),
    [isAdmin]
  );

  // Storage stats from user quota (not repo capacity)
  const isUnlimited = quota?.is_unlimited ?? false;
  const totalUsed = quota?.used_bytes ?? 0;
  const totalMax = quota && !quota.is_unlimited && quota.quota_bytes > 0 ? quota.quota_bytes : 0;
  const storagePercent = totalMax > 0 ? Math.min((totalUsed / totalMax) * 100, 100) : 0;

  const handleLogout = async () => {
    try {
      if (refreshTokenValue) {
        await logoutApi(refreshTokenValue);
      }
    } catch {
      // Ignore — clear local state regardless
    }
    clearAuth();
    router.push("/login");
  };

  return (
    <>
      {/* Desktop sidebar — always dark navy */}
      <aside
        className={cn(
          "hidden md:flex h-screen flex-col border-r transition-all duration-200",
          "bg-[var(--color-sidebar)] border-[var(--color-sidebar-border)]",
          collapsed ? "w-[60px]" : "w-[232px]"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center px-4 py-5", collapsed && "justify-center px-2")}>
          <Logo
            size={collapsed ? "xs" : "md"}
            iconOnly={collapsed}
            subtitle={collapsed ? undefined : "encrypted vault"}
          />
        </div>

        {/* User info */}
        {user && (
          <div className={cn(
            "border-b border-[var(--color-sidebar-border)] mb-1",
            collapsed ? "px-1.5 pb-3 flex justify-center" : "px-4 pb-3"
          )}>
            {!collapsed ? (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/15 text-cyan-400 text-xs font-bold flex-shrink-0 uppercase">
                  {user.username?.[0] || user.email[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-white/90 truncate">{user.username}</p>
                    {isAdmin ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-amber-500/15 text-amber-400 flex-shrink-0">
                        Admin
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-px rounded bg-white/5 text-[var(--color-sidebar-text)] flex-shrink-0">
                        User
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-sidebar-text)] truncate mt-0.5">{user.email}</p>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/15 text-cyan-400 text-xs font-bold uppercase"
                title={`${user.username} (${user.email})`}
              >
                {user.username?.[0] || user.email[0]}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className={cn("flex-1 py-3 space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname.startsWith("/admin") : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150",
                  collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                  active
                    ? "bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]"
                    : "text-[var(--color-sidebar-text)] hover:text-white/80 hover:bg-[var(--color-sidebar-hover)]"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] flex-shrink-0",
                    active ? "text-cyan-400" : ""
                  )}
                />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Storage progress bar */}
        <div className={cn("px-4 pb-3", collapsed && "px-2")}>
          {!collapsed ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-sidebar-text)]">
                  <Database className="h-3 w-3" />
                  Storage
                </span>
                <span className="text-[10px] tabular-nums text-[var(--color-sidebar-text)]">
                  {isUnlimited ? "\u221E" : totalMax > 0 ? `${storagePercent.toFixed(0)}%` : "\u2014"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                {totalMax > 0 && (
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-cyan-500"
                    )}
                    style={{ width: `${storagePercent}%` }}
                  />
                )}
              </div>
              <p className="text-[10px] tabular-nums text-[var(--color-sidebar-text)]">
                {isUnlimited
                  ? `${formatBytes(totalUsed)} used`
                  : totalMax > 0
                    ? `${formatBytes(totalUsed)} / ${formatBytes(totalMax)}`
                    : "No platform connected"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center" title={isUnlimited ? `${formatBytes(totalUsed)} used` : totalMax > 0 ? `${formatBytes(totalUsed)} / ${formatBytes(totalMax)}` : "No platform"}>
              <div className="h-8 w-1.5 rounded-full bg-white/8 overflow-hidden rotate-180">
                {totalMax > 0 && (
                  <div
                    className={cn(
                      "w-full rounded-full transition-all duration-500",
                      storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-cyan-500"
                    )}
                    style={{ height: `${storagePercent}%` }}
                  />
                )}
              </div>
              <Database className="h-3 w-3 text-[var(--color-sidebar-text)] mt-1" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn(
          "py-3 border-t border-[var(--color-sidebar-border)]",
          collapsed ? "px-1.5 flex flex-col items-center gap-1" : "px-4 flex items-center justify-between"
        )}>
          {!collapsed && (
            <p className="text-[10px] text-[var(--color-sidebar-text)] leading-relaxed font-heading">
              zcrypt.cloud
            </p>
          )}
          <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-1")}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--color-sidebar-hover)] text-[var(--color-sidebar-text)] hover:text-white/80 transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--color-sidebar-hover)] text-[var(--color-sidebar-text)] hover:text-white/80 transition-colors"
              aria-label="Toggle theme"
              title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-red-500/10 text-[var(--color-sidebar-text)] hover:text-red-400 transition-colors"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile dock */}
      <MobileDock pathname={pathname} onLogout={handleLogout} isAdmin={isAdmin} />
    </>
  );
}

function MobileDock({ pathname, onLogout, isAdmin }: { pathname: string; onLogout: () => void; isAdmin: boolean }) {
  const mouseX = useMotionValue(Infinity);
  const { resolvedTheme, toggleTheme } = useTheme();

  const links = useMemo(
    () => (isAdmin ? [...baseLinks, adminLink] : baseLinks),
    [isAdmin]
  );

  return (
    <motion.nav
      aria-label="Main navigation"
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 flex items-end gap-1.5 px-3 py-2.5 rounded-2xl glass shadow-2xl"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
    >
      {links.map((link) => (
        <DockItem
          key={link.href}
          {...link}
          active={link.href === "/admin" ? pathname.startsWith("/admin") : pathname === link.href}
          mouseX={mouseX}
        />
      ))}
      {/* Theme toggle */}
      <button onClick={toggleTheme} className="relative" aria-label="Toggle theme">
        <motion.div className="flex items-center justify-center h-11 w-11 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </motion.div>
      </button>
      {/* Logout */}
      <button onClick={onLogout} className="relative">
        <motion.div className="flex items-center justify-center h-11 w-11 rounded-xl text-[var(--color-text-muted)] hover:text-red-500 transition-colors">
          <LogOut className="h-5 w-5" />
        </motion.div>
        <span className="sr-only">Log out</span>
      </button>
    </motion.nav>
  );
}

function DockItem({
  href,
  label,
  icon: Icon,
  active,
  mouseX,
}: {
  href: string;
  label: string;
  icon: typeof Shield;
  active: boolean;
  mouseX: MotionValue<number>;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(distance, [-120, 0, 120], [44, 64, 44]);
  const width = useSpring(widthSync, {
    mass: 0.1,
    stiffness: 200,
    damping: 15,
  });

  return (
    <Link href={href} ref={ref} className="relative">
      <motion.div
        style={{ width, height: width }}
        className={cn(
          "flex items-center justify-center rounded-xl transition-colors",
          active
            ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <Icon className="h-5 w-5" />
      </motion.div>
      {/* Active dot */}
      {active && (
        <motion.div
          layoutId="dock-dot"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-cyan-500"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <span className="sr-only">{label}</span>
    </Link>
  );
}
