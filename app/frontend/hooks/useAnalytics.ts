"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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
import {
  ensureNames,
  peekName,
  resolveFileNames,
  subscribeNames,
  getNamesEpoch,
} from "@/lib/file-names";
import { LOCKED } from "@/lib/sealed";
import { usePassphraseStore } from "@/store/passphrase";
import { useAnalyticsFiltersStore } from "@/store/analytics-filters";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getRangeBounds, type RangeBounds } from "@/components/analytics/date-range";
import type { FileMetadata } from "@/types";

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
 *
 * Keys come from `range.key` (preset + day). The concrete ISO window is
 * resolved inside the queryFn, at fetch time, so a Refresh an hour later still
 * asks for "up to now".
 */
const ANALYTICS_QUERY_OPTS = {
  staleTime: Infinity,
  refetchOnReconnect: false,
} as const;

function windowOf(range: RangeBounds): { start: string; end: string } {
  const b = getRangeBounds(range.preset, range.customStart, range.customEnd);
  return { start: b.start ? b.start.toISOString() : "", end: b.end.toISOString() };
}

const summaryOptions = (range: RangeBounds) => ({
  queryKey: qk.analyticsSummary(range.key),
  queryFn: () => getAnalyticsSummary({ ...windowOf(range), allTime: range.allTime }),
  ...ANALYTICS_QUERY_OPTS,
});

const timeseriesOptions = (range: RangeBounds) => ({
  queryKey: qk.analyticsTimeseries(range.key, range.bucket),
  queryFn: () => {
    // The timeseries endpoint always needs a concrete window; "All time"
    // widens it to the epoch rather than requiring its own special case.
    const { start, end } = windowOf(range);
    return getAnalyticsTimeseries(start || new Date(0).toISOString(), end, range.bucket);
  },
  ...ANALYTICS_QUERY_OPTS,
});

const fileTypesOptions = (range: RangeBounds) => ({
  queryKey: qk.analyticsFileTypes(range.key),
  queryFn: () => getAnalyticsFileTypes({ ...windowOf(range), allTime: range.allTime }),
  ...ANALYTICS_QUERY_OPTS,
});

export function useAnalyticsSummary(range: RangeBounds) {
  const query = useQuery(summaryOptions(range));
  return { summary: query.data ?? null, isLoading: query.isPending, error: query.error };
}

export function useAnalyticsTimeseries(range: RangeBounds) {
  const query = useQuery(timeseriesOptions(range));
  return { data: query.data ?? null, isLoading: query.isPending, error: query.error };
}

/** Warm the Insights page (hover/focus on its nav link): the selected range
 *  plus the lifetime panels. A no-op for anything already cached. */
export function prefetchAnalytics(): Promise<void> {
  const { preset, customStart, customEnd } = useAnalyticsFiltersStore.getState();
  const range = getRangeBounds(preset, customStart, customEnd);
  const all = getRangeBounds("all", null, null);
  return Promise.all([
    queryClient.prefetchQuery(summaryOptions(range)),
    queryClient.prefetchQuery(summaryOptions(all)),
    queryClient.prefetchQuery(timeseriesOptions(range)),
    queryClient.prefetchQuery(fileTypesOptions(range)),
    queryClient.prefetchQuery(fileTypesOptions(all)),
  ]).then(() => undefined);
}

export function useStorageGrowth() {
  const query = useQuery({
    queryKey: qk.analyticsStorageGrowth,
    queryFn: getAnalyticsStorageGrowth,
    ...ANALYTICS_QUERY_OPTS,
  });
  return { points: query.data ?? [], isLoading: query.isPending, error: query.error };
}

/** The names epoch + lock state. The cache (and its disk snapshot) keeps only
 *  ciphertext; names resolve in `select` from the shared in-memory maps. */
function useNameState() {
  const epoch = useSyncExternalStore(subscribeNames, getNamesEpoch, getNamesEpoch);
  const unlocked = usePassphraseStore((s) => s.cachedPassphrase != null);
  return { epoch, unlocked };
}

/** Decrypt any names in `items` not seen yet (a no-op while locked). */
function useEnsureNames(items: { encrypted_name?: string }[] | undefined, unlocked: boolean) {
  useEffect(() => {
    if (unlocked && items) void ensureNames(items.map((it) => it.encrypted_name));
  }, [items, unlocked]);
}

function resolveItemNames(
  items: AnalyticsFileTypeItem[],
  unlocked: boolean,
  _epoch: number,
): AnalyticsFileTypeItem[] {
  if (!items.some((it) => it.encrypted_name)) return items;
  return items.map((it) =>
    it.encrypted_name
      ? { ...it, original_name: unlocked ? (peekName(it.encrypted_name) ?? "") : LOCKED }
      : it,
  );
}

export function useAnalyticsFileTypes(range: RangeBounds) {
  const { epoch, unlocked } = useNameState();
  const select = useCallback(
    (d: AnalyticsFileTypeItem[]) => resolveItemNames(d, unlocked, epoch),
    [epoch, unlocked],
  );
  const query = useQuery({ ...fileTypesOptions(range), select });
  useEnsureNames(query.data, unlocked);
  return { items: query.data ?? [], isLoading: query.isPending, error: query.error };
}

export function useRecentUploads(limit = 8) {
  const { epoch, unlocked } = useNameState();
  const select = useCallback(
    (d: FileMetadata[]) => resolveFileNames(d, unlocked, epoch),
    [epoch, unlocked],
  );
  const query = useQuery({
    queryKey: qk.recentUploads(limit),
    queryFn: () => listFiles(limit),
    select,
    ...ANALYTICS_QUERY_OPTS,
  });
  useEnsureNames(query.data, unlocked);
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
