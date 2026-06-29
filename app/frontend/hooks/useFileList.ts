"use client";

import { useCallback, useEffect } from "react";
import type { FileMetadata } from "@/types";
import {
  useFilesQuery,
  setFilesData,
  invalidateFiles,
  hydrateFilesFromCache,
} from "@/store/files";

/**
 * Vault file list. A thin adapter over the TanStack Query `files` cache so every
 * existing consumer keeps the same shape (`files`, `loading`, `error`, `refresh`,
 * `setFiles`) while the underlying source of truth is now a single query that
 * mutations invalidate — no second stale copy to drift out of sync.
 */
export function useFileList() {
  const query = useFilesQuery();

  // Instant cold start: seed from the OPFS offline cache if the query has no
  // data yet. Only fills an empty cache, so it never clobbers fresher state.
  useEffect(() => {
    void hydrateFilesFromCache();
  }, []);

  // `filter` is accepted for call-site compatibility but ignored: the explorer
  // filters the single global list client-side, so a refresh just reconciles
  // the whole list against the server.
  const refresh = useCallback(async (_filter?: string) => {
    await invalidateFiles();
  }, []);

  const setFiles = useCallback(
    (files: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[])) => {
      setFilesData(files);
    },
    []
  );

  const files = query.data ?? [];

  return {
    files,
    // Skeleton only when there is genuinely nothing to show yet.
    loading: query.isPending && files.length === 0,
    error: query.error instanceof Error ? query.error.message : null,
    refresh,
    setFiles,
  };
}
