"use client";

import { useQuotaQuery } from "@/store/quota";

const DEFAULT_LIMIT = 200;

/** Most files one "add to space" batch may carry on the user's plan. */
export function useSpaceBatchLimit(): number {
  const { data } = useQuotaQuery();
  const limit = data?.max_space_batch_files;
  if (limit === undefined || limit === null) return DEFAULT_LIMIT;
  return limit === 0 ? Infinity : limit;
}
