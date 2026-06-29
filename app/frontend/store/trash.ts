"use client";

import { useQuery } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import { listTrash } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";

/**
 * Trash server-state, backed by TanStack Query. Previously this lived in a
 * component-local useState "island" with no link to the vault file list, so a
 * restore updated trash but left the vault stale (and vice-versa). Now both read
 * shared query keys and mutations invalidate across them.
 */
export function useTrashQuery() {
  return useQuery({
    queryKey: qk.trash,
    queryFn: () => listTrash(),
  });
}

/** Optimistic write to the trash cache (drop-on-restore / drop-on-purge). */
export function setTrashData(
  updater: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[])
): void {
  queryClient.setQueryData<FileMetadata[]>(qk.trash, (prev) => {
    const base = prev ?? [];
    return typeof updater === "function"
      ? (updater as (p: FileMetadata[]) => FileMetadata[])(base)
      : updater;
  });
}

export function invalidateTrash(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: qk.trash });
}
