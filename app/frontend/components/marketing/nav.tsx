"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "motion/react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { Sun, Moon, Menu, X, ArrowRight } from "@/lib/icons";
import { Logo } from "@/components/ui/logo";

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/tui", label: "TUI" },
  { href: "/docs", label: "Docs" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  return (
    <>
      {/* Spacer */}
      <div className="h-4" />

      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none pt-3 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pointer-events-auto max-w-6xl mx-auto flex items-center justify-between"
        >
          {/* Left — Logo (standalone) */}
          <Link
            href="/"
            className={cn(
              "flex items-center rounded-xl px-2 py-1.5 transition-all duration-300",
              scrolled
                ? "bg-[var(--color-surface)]/80 "
                : "bg-transparent"
            )}
          >
            <Logo size="lg" />
          </Link>

          {/* Center — Nav pill */}
          <nav
            className={cn(
              "hidden md:flex items-center gap-0.5 rounded-2xl px-1.5 py-1.5 transition-all duration-300",
              scrolled
                ? "bg-[var(--color-surface)]/90 backdrop-blur-xl shadow-lg shadow-black/[0.04] dark:shadow-black/20 border border-[var(--color-border)]"
                : "bg-transparent"
            )}
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200",
                  pathname === link.href
                    ? "text-[var(--color-text)] bg-[var(--color-surface-1)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right — Actions */}
          <div
            className={cn(
              "flex items-center gap-0.5 rounded-2xl px-1.5 py-1.5 transition-all duration-300",
              scrolled
                ? "bg-[var(--color-surface)]/90 backdrop-blur-xl shadow-lg shadow-black/[0.04] dark:shadow-black/20 border border-[var(--color-border)]"
                : "bg-transparent"
            )}
          >
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60 transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            <Link
              href="/login"
              className="hidden md:flex px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg transition-colors"
            >
              Log in
            </Link>

            <Link
              href="/register"
              className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold bg-[var(--color-text)] text-[var(--color-bg)] rounded-lg hover:opacity-90 transition-opacity"
            >
              Get started
              <ArrowRight className="h-3 w-3" />
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>
          </div>
        </motion.div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-4 right-4 top-16 z-50 md:hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden"
            >
              <div className="p-3 space-y-0.5">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)] transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="p-3 pt-0 border-t border-[var(--color-border)] mt-1">
                <div className="flex gap-2 pt-3">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center px-4 py-2.5 text-sm font-medium rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center px-4 py-2.5 text-sm font-semibold bg-[var(--color-text)] text-[var(--color-bg)] rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Sign up
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
