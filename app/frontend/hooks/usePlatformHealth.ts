"use client";

import { useCallback, useEffect } from "react";
import { usePlatformStore, fetchPlatformHealth } from "@/store/platform";

export function usePlatformHealth() {
  const { statuses, repos, loading } = usePlatformStore();

  const refresh = useCallback(async () => {
    await fetchPlatformHealth(true);
  }, []);

  useEffect(() => {
    // Deduped: skips if AuthGuard (or a sibling page) already fetched recently,
    // and coalesces with any in-flight fetch — one request on a fresh load.
    fetchPlatformHealth();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") fetchPlatformHealth(true);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const isAnyConnected = statuses.some((s) => s.connected);

  return { statuses, repos, loading, refresh, isAnyConnected };
}
