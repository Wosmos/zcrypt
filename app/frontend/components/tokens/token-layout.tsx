import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/marketing/landing/base.css";
import { tr } from "@/store/translate";

// Under `output: export` (the Tauri desktop build) Next 16 requires at least
// one concrete param per dynamic segment; an empty array is rejected with
// "missing generateStaticParams()". These share pages are fully client-rendered
// (token read from the URL at runtime) and are stripped from the desktop bundle
// anyway, so a single throwaway shell satisfies the export. On the web build
// (no export) the route stays fully dynamic, dynamicParams defaults to true.
const TOKEN_STATIC_PARAMS = [{ token: "placeholder" }];

export function generateStaticParams() {
  return TOKEN_STATIC_PARAMS;
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
      {children}
    </main>
  );
}
