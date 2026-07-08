"use client";

import { useQuery } from "@tanstack/react-query";
import type { PlatformStatus, RepoInfo } from "@/types";
import { getPlatformStatus, listRepos } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getQueryData, invalidateKey } from "@/lib/query-cache";

/**
 * Platform server-state (connected tokens + storage repos), backed by TanStack
 * Query. Connect/disconnect/scope-toggle invalidate these keys so the status
 * grid, storage gauges, and onboarding check all read one fresh source instead
 * of a 30s-stale Zustand snapshot that could disagree across views.
 */
export function usePlatformStatusQuery() {
  return useQuery({
    queryKey: qk.platforms,
    queryFn: () => getPlatformStatus(),
  });
}

export function useReposQuery() {
  return useQuery({
    queryKey: qk.repos,
    queryFn: () => listRepos(),
  });
}

/** Non-reactive snapshot (e.g. the AuthGuard onboarding check). */
export function getPlatformStatusData(): PlatformStatus[] {
  return getQueryData<PlatformStatus[]>(qk.platforms, []);
}

export function getReposData(): RepoInfo[] {
  return getQueryData<RepoInfo[]>(qk.repos, []);
}

/** Refetch both platform views after a connect/disconnect/scope change. */
export function invalidatePlatforms(): Promise<void> {
  return Promise.all([
    invalidateKey(qk.platforms),
    invalidateKey(qk.repos),
  ]).then(() => undefined);
}

/**
 * Fetch-or-cache the platform status, returning it directly. Used by the
 * AuthGuard onboarding check, which needs the value (not a hook). Resolves to an
 * empty array if the request fails, so a transient error never bounces the user
 * to /onboarding.
 */
export async function ensurePlatformStatus(): Promise<PlatformStatus[]> {
  try {
    return await queryClient.ensureQueryData({
      queryKey: qk.platforms,
      queryFn: () => getPlatformStatus(),
    });
  } catch {
    return [];
  }
}
