"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkForUpdates, isTauri } from "@/lib/tauri";

const RECHECK_MS = 6 * 60 * 60 * 1000;

export function UpdatePill() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    const check = () => {
      checkForUpdates()
        .then((info) => {
          if (cancelled) return;
          setVersion(info.available && !info.channel ? (info.version ?? "") : null);
        })
        .catch(() => {});
    };
    check();
    const timer = setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (version === null) return null;

  return (
    <Link
      href="/settings?section=updates"
      aria-label={`A new version${version ? ` (${version})` : ""} is available. Open updates.`}
      className="hidden items-center gap-2 rounded-full border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 md:inline-flex"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
      </span>
      New version{version ? ` ${version}` : ""} is out
    </Link>
  );
}
