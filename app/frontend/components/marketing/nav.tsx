"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { Shield, Sun, Moon, Menu, X } from "lucide-react";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/philosophy", label: "Philosophy" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/40 transition-all">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[15px] font-bold tracking-tight">
                zpush
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3.5 py-2 text-[13px] font-medium rounded-lg transition-colors",
                    pathname === link.href
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
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

              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-[13px] font-medium bg-emerald-500 text-slate-900 rounded-lg hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/25"
                >
                  Sign up free
                </Link>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--color-surface-1)] text-[var(--color-text-muted)] transition-colors"
                aria-label="Toggle menu"
              >
                {mobileOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-16 z-40 md:hidden glass border-b border-[var(--color-border)]"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2.5 text-sm font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-3 border-t border-[var(--color-border)] flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2.5 text-sm font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center px-4 py-2.5 text-sm font-medium bg-emerald-500 text-slate-900 rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
