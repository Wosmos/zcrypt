"use client";

import { useCallback, useEffect, useRef } from "react";
import { getPlatformStatus, listRepos } from "@/lib/api";
import { usePlatformStore } from "@/store/platform";

export function usePlatformHealth() {
  const { statuses, repos, loading, setStatuses, setRepos, setLoading } = usePlatformStore();

  const refreshRef = useRef<() => Promise<void>>(null);

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

  refreshRef.current = refresh;

  useEffect(() => {
    refreshRef.current?.();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refreshRef.current?.();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const isAnyConnected = statuses.some((s) => s.connected);

  return { statuses, repos, loading, refresh, isAnyConnected };
}
