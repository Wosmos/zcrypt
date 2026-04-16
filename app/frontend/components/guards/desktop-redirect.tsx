"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isTauri } from "@/lib/tauri";

/**
 * Redirects to /login when running inside the Tauri desktop app.
 * In production builds these pages are stripped entirely by build-frontend.sh,
 * but in dev mode Tauri loads the full Next.js dev server — this guard
 * prevents public/marketing pages from rendering in that case.
 */
export function DesktopRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (isTauri) router.replace("/login");
  }, [router]);

  if (isTauri) return null;

  return <>{children}</>;
}
