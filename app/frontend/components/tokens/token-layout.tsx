import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "@/components/marketing/landing/base.css";
import { tr } from "@/store/translate";
import { TOKEN_SHELL_PARAMS } from "@/lib/route-shell";

// Every token is served by the one prerendered `/<base>/_` page (see
// lib/route-shell); the token is read from the URL at runtime.
export function generateStaticParams() {
  return TOKEN_SHELL_PARAMS;
}

export function tokenMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}

/** "Expires in" countdown for a share/pad/send link: "Xd Xh", "Xh Xm", "Xm", or "Expired". */
export function formatShortExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return tr("tokens.expired");
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24)
    return tr("tokens.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
  if (hours > 0) return tr("tokens.hoursMinutes", { hours, minutes: mins });
  return tr("tokens.minutes", { minutes: mins });
}

export function TokenViewerMain({ children }: { children: ReactNode }) {
  return (
    <main className="pv2 min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4 pt-safe pb-safe px-safe">
      {/* The page reads its token with useSearchParams, which needs a boundary. */}
      <Suspense>{children}</Suspense>
    </main>
  );
}
