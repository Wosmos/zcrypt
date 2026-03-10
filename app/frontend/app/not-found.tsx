import Link from "next/link";
import { Shield, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07] blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--color-accent), transparent)" }}
        />
      </div>

      <div className="relative text-center max-w-md mx-auto">
        {/* Icon */}
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/20 mb-8">
          <Shield className="h-10 w-10 text-[var(--color-accent)]" />
        </div>

        {/* 404 */}
        <div className="relative mb-4">
          <span className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter text-[var(--color-surface-2)] select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter bg-gradient-to-b from-[var(--color-text)] to-[var(--color-text-muted)] bg-clip-text text-transparent select-none">
              404
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the URL or head back to safety.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            My Vault
          </Link>
        </div>

        {/* Decorative dots */}
        <div className="flex items-center justify-center gap-1.5 mt-12">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          <div className="h-1.5 w-6 rounded-full bg-[var(--color-accent)]/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/20" />
        </div>
      </div>
    </div>
  );
}
