import { useCallback } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { queryClient } from "@/lib/query-client";
import { adminGetStats, adminListTokens } from "@/lib/api";
import { Role } from "@/types";

/** The admin overview's data (stats + platform tokens). Shared by the page and
 *  the sidebar's hover prefetch so both fill the same cache entry. */
export async function fetchAdminOverview() {
  const [stats, tokens] = await Promise.all([adminGetStats(), adminListTokens()]);
  return { stats, tokens };
}

/**
 * Cached admin read: a normal query that is simply disabled until the current
 * user is confirmed an admin. Revisiting an admin page serves the cache (2m
 * stale time, previous data kept while a new key loads, see lib/query-client).
 * `refresh` (the error panel's "Try again", or after a mutation) refetches this
 * view and marks every other admin view stale, since a role/plan/quota change
 * shows up on several of them.
 */
export function useAdminQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  opts: { keepPrevious?: boolean } = {},
) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === Role.Admin;
  const query = useQuery({
    queryKey,
    queryFn,
    enabled: isAdmin,
    ...(opts.keepPrevious === false ? { placeholderData: undefined } : {}),
  });
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin"] });
  }, []);

  return {
    user,
    data: query.data,
    loading: query.isPending,
    error: query.isError,
    refresh,
  };
}
