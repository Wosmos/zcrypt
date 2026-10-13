"use client";

import { useCallback } from "react";
import type { PlatformStatus, RepoInfo } from "@/types";
import { usePlatformStatusQuery, useReposQuery, invalidatePlatforms } from "@/store/platform";
import { asList } from "@/lib/query-cache";

/**
 * Platform health adapter: keeps the `{ statuses, repos, loading, refresh,
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

  const statuses = asList<PlatformStatus>(statusesQuery.data);
  const repos = asList<RepoInfo>(reposQuery.data);

  return {
    statuses,
    repos,
    loading: statusesQuery.isPending || reposQuery.isPending,
    refresh,
    isAnyConnected: statuses.some((s) => s.connected),
  };
}
