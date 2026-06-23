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
import { Sun, Moon, Menu, X, ArrowRight, ChevronDown } from "@/lib/icons";
import { Logo } from "@/components/ui/logo";

// Tools grouped under a single dropdown so first-time visitors aren't
// confronted with opaque product names in the primary nav.
const toolLinks = [
  {
    href: "/send",
    label: "Send a file",
    desc: "Encrypted one-off file sharing",
  },
  {
    href: "/pad",
    label: "Encrypted notepad",
    desc: "Private, zero-knowledge notes",
  },
  {
    href: "/transfer",
    label: "Device transfer",
    desc: "Move files between your devices",
  },
];

// Primary nav — clear, intent-first links for first-time visitors.
const navLinks = [
  { href: "/", label: "Home" },
  { href: "/docs/how-it-works", label: "How it works" },
  { href: "/philosophy", label: "Why zcrypt" },
];

// Developer-facing destinations, demoted out of the primary nav.
const devLinks = [
  { href: "/tui", label: "Terminal app (TUI)" },
  { href: "/docs", label: "Docs" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
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
          className={cn(
            "pointer-events-auto max-w-6xl mx-auto flex items-center justify-between rounded-3xl corner-squircle px-3 py-2 transition-all duration-300",
            scrolled
              ? "nav-glass border border-[rgba(0,213,228,0.18)]"
              : "bg-transparent"
          )}
        >
          {/* Left — Logo (standalone) */}
          <Link
            href="/"
            aria-label="zcrypt home"
            className="flex items-center"
          >
            <Logo size="lg" />
          </Link>

          {/* Center — Nav pill */}
          <nav
            className="hidden md:flex items-center gap-0.5"
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

            {/* Tools — dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setToolsOpen(true)}
              onMouseLeave={() => setToolsOpen(false)}
            >
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                aria-expanded={toolsOpen}
                aria-haspopup="menu"
                className={cn(
                  "flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200",
                  toolLinks.some((t) => t.href === pathname)
                    ? "text-[var(--color-text)] bg-[var(--color-surface-1)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60"
                )}
              >
                Tools
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    toolsOpen && "rotate-180"
                  )}
                />
              </button>

              <AnimatePresence>
                {toolsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    role="menu"
                    className="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-64 rounded-2xl corner-squircle nav-glass-panel border border-[rgba(0,213,228,0.18)] p-1.5"
                  >
                    {toolLinks.map((tool) => (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        role="menuitem"
                        onClick={() => setToolsOpen(false)}
                        className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-1)]"
                      >
                        <span className="text-[13px] font-medium text-[var(--color-text)]">
                          {tool.label}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {tool.desc}
                        </span>
                      </Link>
                    ))}

                    <div className="my-1 h-px bg-[var(--color-border)]" />

                    <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      For developers
                    </p>
                    {devLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        role="menuitem"
                        onClick={() => setToolsOpen(false)}
                        className="flex rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* Right — Actions */}
          <div
            className="flex items-center gap-0.5"
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
              className="fixed left-4 right-4 top-16 z-50 md:hidden rounded-2xl corner-squircle nav-glass-panel border border-[rgba(0,213,228,0.18)] overflow-hidden"
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

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Tools
                </p>
                {toolLinks.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)] transition-colors"
                  >
                    {tool.label}
                  </Link>
                ))}

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  For developers
                </p>
                {devLinks.map((link) => (
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
