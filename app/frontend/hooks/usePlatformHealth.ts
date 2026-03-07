"use client";

import { useCallback, useEffect } from "react";
import { getPlatformStatus, listRepos } from "@/lib/api";
import { usePlatformStore } from "@/store/platform";

export function usePlatformHealth() {
  const { statuses, repos, loading, setStatuses, setRepos, setLoading } = usePlatformStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getPlatformStatus(), listRepos()]);
      setStatuses(s);
      setRepos(r);
    } catch {
      // silently fail — platform might not be connected yet
    } finally {
      setLoading(false);
    }
  }, [setStatuses, setRepos, setLoading]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const isAnyConnected = statuses.some((s) => s.connected);

  return { statuses, repos, loading, refresh, isAnyConnected };
}
