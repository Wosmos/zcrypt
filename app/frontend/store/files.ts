import { create } from "zustand";
import type { FileMetadata } from "@/types";

interface FileStore {
  files: FileMetadata[];
  loading: boolean;
  error: string | null;
  setFiles: (files: FileMetadata[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  files: [],
  loading: true,
  error: null,
  setFiles: (files) => set({ files, error: null, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
