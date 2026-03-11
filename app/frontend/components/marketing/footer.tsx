import Link from "next/link";
import { Shield } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Logo + tagline */}
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/20">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[15px] font-bold tracking-tight">
                zpush
              </span>
            </Link>
            <p className="text-xs text-[var(--color-text-muted)] mt-2 max-w-xs leading-relaxed">
              Zero-knowledge encrypted cloud storage. Open source.
              Privacy you can verify, not just trust.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12">
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Product
              </p>
              <div className="flex flex-col gap-1.5">
                <Link
                  href="/#features"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Features
                </Link>
                <Link
                  href="/#pricing"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/philosophy"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Philosophy
                </Link>
              </div>
            </div>
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Account
              </p>
              <div className="flex flex-col gap-1.5">
                <Link
                  href="/login"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Legal
              </p>
              <div className="flex flex-col gap-1.5">
                <Link
                  href="/terms"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Terms of Service
                </Link>
                <Link
                  href="/privacy"
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} zpush. Your data belongs to you.
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Zero-knowledge encryption. Open source. Auditable by anyone.
          </p>
        </div>
      </div>
    </footer>
  );
}
