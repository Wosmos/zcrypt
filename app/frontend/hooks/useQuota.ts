"use client";

import { useCallback } from "react";
import { useQuotaQuery, invalidateQuota } from "@/store/quota";

/**
 * Quota adapter — keeps the `{ quota, refresh }` shape every consumer expects
 * while the source of truth is now the `qk.quota` TanStack query.
 */
export function useQuota() {
  const query = useQuotaQuery();

  const refresh = useCallback(async () => {
    await invalidateQuota();
  }, []);

  return { quota: query.data ?? null, refresh };
}
