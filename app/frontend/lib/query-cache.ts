/**
 * Thin, typed helpers over the singleton TanStack QueryClient, folding the
 * byte-identical cache accessors sprinkled across the server-state stores:
 *   - `setListData` folds the identical setFilesData / setTrashData writers
 *     (prev ?? [] then apply an updater that's either a value or a fn).
 *   - `getQueryData` / `invalidateKey` fold the thin get/invalidate wrappers.
 *
 * The bespoke fetch-or-cache `ensureX` variants (with their own try/catch and
 * side effects) stay in their stores — they're not just cache reads.
 */
import type { QueryKey } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

/** Optimistically write a list-shaped query. The updater is either the next
 *  array or a fn of the previous array (treated as `[]` when unset). */
export function setListData<T>(key: QueryKey, updater: T[] | ((prev: T[]) => T[])): void {
  queryClient.setQueryData<T[]>(key, (prev) => {
    const base = prev ?? [];
    return typeof updater === "function" ? (updater as (p: T[]) => T[])(base) : updater;
  });
}

/** Non-reactive snapshot of a query's data, or `fallback` when unset. */
export function getQueryData<T>(key: QueryKey, fallback: T): T {
  return queryClient.getQueryData<T>(key) ?? fallback;
}

/** Invalidate (and refetch) a query key. */
export function invalidateKey(key: QueryKey): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: key });
}
