"use client";

import { useCallback, useEffect } from "react";
import { listFiles } from "@/lib/api";
import { useFileStore } from "@/store/files";

export function useFileList() {
  const { files, loading, error, setFiles, setLoading, setError } = useFileStore();

  const refresh = useCallback(async (filter?: string) => {
    setLoading(true);
    try {
      const data = await listFiles(filter);
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    }
  }, [setFiles, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, error, refresh };
}
