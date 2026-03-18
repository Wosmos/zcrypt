"use client";

import { useCallback, useEffect } from "react";
import { getQuota } from "@/lib/api";
import { useQuotaStore } from "@/store/quota";

export function useQuota() {
  const { quota, setQuota } = useQuotaStore();

  const refresh = useCallback(async () => {
    try {
      const q = await getQuota();
      setQuota(q);
    } catch {
      // silently fail
    }
  }, [setQuota]);

  useEffect(() => {
    if (!quota) refresh();
  }, [quota, refresh]);

  return { quota, refresh };
}
