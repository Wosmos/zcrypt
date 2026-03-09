"use client";

import { useCallback, useEffect, useRef } from "react";
import { listFiles } from "@/lib/api";
import { useFileStore } from "@/store/files";

export function useFileList() {
  const { files, loading, error, setFiles, setLoading, setError } = useFileStore();
  const hasFetched = useRef(false);

  const refresh = useCallback(async (filter?: string) => {
    // SWR pattern: only show loading skeleton on first load (empty store)
    // On subsequent refreshes, keep showing stale data while revalidating
    if (!hasFetched.current) setLoading(true);
    try {
      const data = await listFiles(filter);
      setFiles(data);
      hasFetched.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    }
  }, [setFiles, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, error, refresh };
}
