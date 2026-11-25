"use client";

import { useEffect, useRef } from "react";
import { announceStorageFull } from "@/lib/announce";
import { useQuotaQuery } from "@/store/quota";
import type { QuotaInfo } from "@/types";

/** True when the account has a cap and has reached it. */
export function isStorageFull(quota: QuotaInfo | null | undefined): boolean {
  return Boolean(
    quota && !quota.is_unlimited && quota.quota_bytes > 0 && quota.used_bytes >= quota.quota_bytes,
  );
}

/**
 * Raises the storage-full alert when the quota query goes from room left to full.
 * Sign-ins and Space events arrive as user events (useUserEvents).
 */
export function useAlertEvents(): void {
  const quota = useQuotaQuery().data;
  const full = isStorageFull(quota);
  const seenRoom = useRef(false);

  useEffect(() => {
    if (!quota) return;
    if (!full) {
      seenRoom.current = true;
      return;
    }
    if (seenRoom.current) announceStorageFull();
    seenRoom.current = false;
  }, [quota, full]);
}
