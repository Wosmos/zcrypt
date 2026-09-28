"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsStorageGrowth,
  getAnalyticsFileTypes,
  getDownloadTotal,
  listFiles,
  type AnalyticsFileTypeItem,
} from "@/lib/api";
import { decryptFileNames } from "@/lib/file-names";
import { userNameKey } from "@/lib/sealed";
import { decryptNameSafe } from "@/lib/name-crypto";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import type { RangeBounds } from "@/components/analytics/date-range";

/**
 * Every analytics query below opts out of the app's normal 30s freshness
 * window: `staleTime: Infinity` + `refetchOnReconnect: false` means an idle
 * or reopened Insights page causes ZERO automatic network/DB traffic on any
 * range, no matter how long it's been. Switching the range preset changes the
 * query key, so that's still one small indexed fetch (expected) — what's
 * eliminated is refetching the SAME range on reload/focus/reconnect. The only
 * way to force fresh data is the explicit Refresh button (useRefreshCooldown),
 * which is also capped server-side per user (see AnalyticsRateLimitMiddleware
 * in app/backend/cmd/auth_middleware.go) so this holds even against extra
 * tabs, another device, or a direct API call with a valid token.
 */
const ANALYTICS_QUERY_OPTS = {
  staleTime: Infinity,
  refetchOnReconnect: false,
} as const;

function iso(d: Date): string {
  return d.toISOString();
}

export function useAnalyticsSummary(range: RangeBounds) {
  const start = range.allTime ? "" : iso(range.start as Date);
  const end = iso(range.end);
  const query = useQuery({
    queryKey: qk.analyticsSummary(range.allTime ? "all" : start, end),
    queryFn: () => getAnalyticsSummary({ start, end, allTime: range.allTime }),
    ...ANALYTICS_QUERY_OPTS,
  });
  return { summary: query.data ?? null, isLoading: query.isPending, error: query.error };
}

export function useAnalyticsTimeseries(range: RangeBounds) {
  // The timeseries endpoint always needs a concrete window; "All time" widens
  // it to the epoch rather than requiring its own special case server-side.
  const start = iso(range.start ?? new Date(0));
  const end = iso(range.end);
  const query = useQuery({
    queryKey: qk.analyticsTimeseries(start, end, range.bucket),
    queryFn: () => getAnalyticsTimeseries(start, end, range.bucket),
    ...ANALYTICS_QUERY_OPTS,
  });
  return { data: query.data ?? null, isLoading: query.isPending, error: query.error };
}

export function useStorageGrowth() {
  const query = useQuery({
    queryKey: qk.analyticsStorageGrowth,
    queryFn: getAnalyticsStorageGrowth,
    ...ANALYTICS_QUERY_OPTS,
  });
  return { points: query.data ?? [], isLoading: query.isPending, error: query.error };
}

/** Decrypts a lean analytics item's name in place, without the full
 *  useFileList() reseal side-effects (this is a read-only analytics view;
 *  the explorer already owns resealing legacy names). */
async function resolveFileTypeNames(
  items: AnalyticsFileTypeItem[],
): Promise<AnalyticsFileTypeItem[]> {
  if (items.length === 0 || !items.some((it) => it.encrypted_name)) return items;
  const key = await userNameKey();
  return Promise.all(
    items.map(async (it) => {
      if (!it.encrypted_name) return it;
      return {
        ...it,
        original_name: key ? await decryptNameSafe(it.encrypted_name, key) : "[locked]",
      };
    }),
  );
}

export function useAnalyticsFileTypes(range: RangeBounds) {
  const start = range.allTime ? "" : iso(range.start as Date);
  const end = iso(range.end);
  const query = useQuery({
    queryKey: qk.analyticsFileTypes(range.allTime ? "all" : start, end),
    queryFn: () =>
      getAnalyticsFileTypes({ start, end, allTime: range.allTime }).then(resolveFileTypeNames),
    ...ANALYTICS_QUERY_OPTS,
  });
  return { items: query.data ?? [], isLoading: query.isPending, error: query.error };
}

export function useRecentUploads(limit = 8) {
  const query = useQuery({
    queryKey: qk.recentUploads(limit),
    queryFn: () => listFiles(undefined, limit).then(decryptFileNames),
    ...ANALYTICS_QUERY_OPTS,
  });
  return { files: query.data ?? [], isLoading: query.isPending, error: query.error };
}

/** Lifetime app installs (not file downloads) — its own lightweight fetch,
 *  independent of the vault's file data. Never breaks the page if it fails. */
export function useAppDownloadsTotal() {
  const query = useQuery({
    queryKey: ["analytics", "app-downloads-total"] as const,
    queryFn: getDownloadTotal,
    ...ANALYTICS_QUERY_OPTS,
    retry: false,
  });
  return query.data ?? null;
}

/** Invalidates every analytics query key at once, for the single Refresh
 *  button (one click refreshes all Insights data together). */
export function useRefreshAnalytics() {
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }, []);
}

/** Convenience: true while any of the given loading flags is still true, for
 *  the page's initial full-skeleton gate. */
export function anyLoading(...flags: boolean[]): boolean {
  return flags.some(Boolean);
}
