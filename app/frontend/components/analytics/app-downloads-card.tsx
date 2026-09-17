"use client";

import { useEffect, useState } from "react";
import { getDownloadTotal } from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { Download } from "@/lib/icons";

/**
 * Installs of the zcrypt app across every device — not files downloaded from a
 * vault. Everything else on this dashboard is derived client-side from the
 * file list; this is the one card backed by a server aggregate, so it fetches
 * on its own and simply renders nothing if the call fails rather than taking
 * the page down with it.
 */
export function AppDownloadsCard() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getDownloadTotal()
      .then((n) => alive && setTotal(n))
      .catch(() => {
        /* a missing counter must never break Insights */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (total === null) return null;

  return (
    <StatCard
      icon={Download}
      label="App downloads"
      value={total.toLocaleString()}
      hint="Installs across macOS, Windows, Linux and Android"
    />
  );
}
