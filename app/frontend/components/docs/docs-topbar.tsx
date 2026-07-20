"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "@/lib/icons";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/download", label: "Download" },
  { href: "/philosophy", label: "Why zcrypt" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/**
 * The docs section's own top bar — a three-column grid with the marketing
 * nav links on the left, a simple centered logo, and the auth actions + theme
 * toggle on the right. Sticky and in normal flow (not a floating overlay), so
 * DocsSidebar sticks right below it rather than under a fixed header.
 */
export function DocsTopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 px-4 backdrop-blur-md md:px-6">
      {/* Left: logo */}
      <Link
        href="/"
        aria-label="zcrypt home"
        className="flex items-center justify-self-start"
      >
        <Logo size="lg" />
      </Link>

      {/* Center: marketing nav links */}
      <nav className="hidden items-center gap-0.5 justify-self-center md:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              pathname === link.href
                ? "bg-[var(--color-surface-1)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)]"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Right: theme toggle + auth actions */}
      <div className="flex items-center gap-1.5 justify-self-end">
        <ThemeToggle className="flex-shrink-0" />
        <Link
          href="/login"
          className="hidden px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] md:inline-flex"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-text)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
        >
          Get started
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
