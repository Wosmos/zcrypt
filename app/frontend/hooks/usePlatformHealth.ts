"use client";

import { useCallback } from "react";
import {
  usePlatformStatusQuery,
  useReposQuery,
  invalidatePlatforms,
} from "@/store/platform";

/**
 * Platform health adapter — keeps the `{ statuses, repos, loading, refresh,
 * isAnyConnected }` shape every consumer expects while the source of truth is
 * now the `qk.platforms` / `qk.repos` TanStack queries. Window-focus refetch is
 * handled globally by the QueryClient, so the old manual visibility listener is
 * gone.
 */
export function usePlatformHealth() {
  const statusesQuery = usePlatformStatusQuery();
  const reposQuery = useReposQuery();

  const refresh = useCallback(async () => {
    await invalidatePlatforms();
  }, []);

  const statuses = statusesQuery.data ?? [];
  const repos = reposQuery.data ?? [];

  return {
    statuses,
    repos,
    loading: statusesQuery.isPending || reposQuery.isPending,
    refresh,
    isAnyConnected: statuses.some((s) => s.connected),
  };
}
