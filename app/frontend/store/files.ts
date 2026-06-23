import { create } from "zustand";
import type { FileMetadata } from "@/types";
import { listFiles } from "@/lib/api";

interface FileStore {
  files: FileMetadata[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  setFiles: (files: FileMetadata[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  files: [],
  loading: false,
  error: null,
  lastFetched: null,
  setFiles: (files) => set({ files, error: null, loading: false, lastFetched: Date.now() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));

const FRESH_MS = 30_000;
let inFlight: Promise<void> | null = null;

// Single deduped initial fetch of the file list, shared by AuthGuard's prefetch
// and useFileList's mount, so a fresh dashboard load issues ONE /api/files even
// when both fire at once. Skips if a recent fetch is cached (unless forced).
export function prefetchFileList(force = false): Promise<void> {
  const store = useFileStore.getState();
  if (!force && store.lastFetched && Date.now() - store.lastFetched < FRESH_MS) {
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  inFlight = listFiles()
    .then((data) => useFileStore.getState().setFiles(data))
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
