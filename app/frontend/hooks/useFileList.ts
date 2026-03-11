"use client";

import { useCallback, useEffect, useRef } from "react";
import { listFiles } from "@/lib/api";
import { useFileStore } from "@/store/files";
import { useAuthStore } from "@/store/auth";

export function useFileList() {
  const { files, loading, error, setFiles, setLoading, setError } = useFileStore();
  const hasFetched = useRef(false);
  const cacheLoaded = useRef(false);

  // Try to load from offline cache on mount (instant data)
  useEffect(() => {
    if (cacheLoaded.current) return;
    cacheLoaded.current = true;

    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    import("@/lib/offline-cache")
      .then(({ getOfflineCache }) => getOfflineCache())
      .then((cache) => {
        const cached = cache.getFiles(userId);
        if (cached.length > 0 && !hasFetched.current) {
          setFiles(cached);
        }
      })
      .catch(() => {});
  }, [setFiles]);

  const refresh = useCallback(async (filter?: string) => {
    if (!hasFetched.current) setLoading(true);
    try {
      const data = await listFiles(filter);
      setFiles(data);
      hasFetched.current = true;

      // Update offline cache in background
      const userId = useAuthStore.getState().user?.id;
      if (userId && !filter) {
        import("@/lib/offline-cache")
          .then(({ getOfflineCache }) => getOfflineCache())
          .then((cache) => cache.setFiles(userId, data))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    }
  }, [setFiles, setLoading, setError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, error, refresh };
}
