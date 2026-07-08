"use client";

import { useQuery } from "@tanstack/react-query";
import type { QuotaInfo } from "@/types";
import { getQuota } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { getQueryData, invalidateKey } from "@/lib/query-cache";

/**
 * Quota server-state, backed by TanStack Query so a delete/move/restore/upload
 * can invalidate it (`qk.quota`) and every consumer — sidebar gauge, vault
 * stats, analytics — updates together instead of showing a stale used-bytes
 * figure after files change.
 */
export function useQuotaQuery() {
  return useQuery({
    queryKey: qk.quota,
    queryFn: () => getQuota(),
    // Quota changes only on file mutations, which invalidate it explicitly.
    staleTime: 60_000,
  });
}

export function getQuotaData(): QuotaInfo | null {
  return getQueryData<QuotaInfo | null>(qk.quota, null);
}

export function invalidateQuota(): Promise<void> {
  return invalidateKey(qk.quota);
}
