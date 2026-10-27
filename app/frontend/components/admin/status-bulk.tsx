"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/store/toast";

/**
 * Sets one status on many rows through a per-row endpoint, then reports how
 * many failed instead of hiding them. Failed ids stay selected so a retry
 * only touches what is left.
 */
export function useBulkStatus<S extends string>(
  update: (id: string, status: S) => Promise<unknown>,
  invalidate: readonly unknown[],
) {
  const t = useTranslations("admin.table");
  const [busy, setBusy] = useState(false);
  const run = async (ids: string[], status: S, label: string): Promise<string[]> => {
    setBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => update(id, status)));
      const failed = ids.filter((_, i) => results[i].status === "rejected");
      if (failed.length === 0) toast.success(t("bulkDone", { count: ids.length, status: label }));
      else {
        const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        toast.error(
          t("bulkSomeFailed", { ok: ids.length - failed.length, failed: failed.length }),
          {
            detail: first.reason instanceof Error ? first.reason.message : undefined,
          },
        );
      }
      await queryClient.invalidateQueries({ queryKey: invalidate });
      return failed;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}
