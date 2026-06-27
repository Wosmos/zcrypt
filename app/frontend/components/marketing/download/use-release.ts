"use client";

import { useEffect, useState } from "react";
import { getLatestRelease, type ReleaseData } from "@/lib/releases";

/**
 * Shared accessor for the latest release.
 * Returns `undefined` while loading, `null` if the lookup failed, otherwise the
 * parsed release data. The underlying fetch is cached, so all islands that call
 * this trigger at most one network request.
 */
export function useLatestRelease(): ReleaseData | null | undefined {
  const [release, setRelease] = useState<ReleaseData | null | undefined>(
    undefined
  );
  useEffect(() => {
    let mounted = true;
    getLatestRelease().then((r) => {
      if (mounted) setRelease(r);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return release;
}
