"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import {
  Settings,
  Shield,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { logout as logoutApi } from "@/lib/auth-api";

const links = [
  { href: "/dashboard", label: "Vault", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { refreshTokenValue, clearAuth } = useAuthStore();

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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-[232px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
            <Shield className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight">
              zpush
            </span>
            <p className="text-[10px] text-[var(--color-text-muted)] -mt-0.5">
              encrypted vault
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 shadow-sm shadow-emerald-500/5"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px]",
                    active ? "text-emerald-600 dark:text-emerald-400" : ""
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            zpush v0.2
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--color-surface-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile dock */}
      <MobileDock pathname={pathname} onLogout={handleLogout} />
    </>
  );
}

function MobileDock({ pathname, onLogout }: { pathname: string; onLogout: () => void }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.nav
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-end gap-1.5 px-3 py-2.5 rounded-2xl glass shadow-2xl"
    >
      {links.map((link) => (
        <DockItem
          key={link.href}
          {...link}
          active={pathname === link.href}
          mouseX={mouseX}
        />
      ))}
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
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <Icon className="h-5 w-5" />
      </motion.div>
      {/* Active dot */}
      {active && (
        <motion.div
          layoutId="dock-dot"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-emerald-500"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <span className="sr-only">{label}</span>
    </Link>
  );
}
