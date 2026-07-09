import type { Metadata } from "next";
import type { ReactNode } from "react";

// Under `output: export` (the Tauri desktop build) Next 16 requires at least
// one concrete param per dynamic segment; an empty array is rejected with
// "missing generateStaticParams()". These share pages are fully client-rendered
// (token read from the URL at runtime) and are stripped from the desktop bundle
// anyway, so a single throwaway shell satisfies the export. On the web build
// (no export) the route stays fully dynamic — dynamicParams defaults to true.
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

/** "Expires in" countdown for a share/pad/send link — "Xd Xh", "Xh Xm", "Xm", or "Expired". */
export function formatShortExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function TokenViewerMain({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      {children}
    </main>
  );
}
