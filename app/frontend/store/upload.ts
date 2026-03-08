import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";

interface UploadStore {
  queue: UploadItem[];
  addToQueue: (file: File) => string;
  setFileId: (id: string, fileId: string) => void;
  updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string, bytesProcessed?: number, totalBytes?: number) => void;
  setError: (id: string, error: string) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
  findByFileId: (fileId: string) => UploadItem | undefined;
  addIncomplete: (fileId: string, name: string, size: number, totalChunks: number, pendingChunks: number, active: boolean) => void;
}

let counter = 0;

export const useUploadStore = create<UploadStore>((set, get) => ({
  queue: [],

  addToQueue: (file: File) => {
    const id = `upload_${++counter}_${Date.now()}`;
    set((state) => ({
      queue: [
        ...state.queue,
        { id, file, status: "queued", progress: 0, stage: "Queued", startedAt: Date.now() },
      ],
    }));
    return id;
  },

  setFileId: (id, fileId) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, fileId } : item
      ),
    }));
  },

  updateStatus: (id, status, progress, stage, bytesProcessed, totalBytes) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              progress: progress ?? item.progress,
              stage: stage ?? item.stage,
              bytesProcessed: bytesProcessed ?? item.bytesProcessed,
              totalBytes: totalBytes ?? item.totalBytes,
            }
          : item
      ),
    }));
  },

  setError: (id, error) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: "failed" as const, error } : item
      ),
    }));
  },

  removeFromQueue: (id) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== id),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter((item) => item.status !== "done"),
    }));
  },

  findByFileId: (fileId) => {
    return get().queue.find((item) => item.fileId === fileId);
  },

  addIncomplete: (fileId, name, size, totalChunks, pendingChunks, active) => {
    // Don't add duplicates
    if (get().queue.some((i) => i.fileId === fileId)) return;
    const id = `resume_${++counter}_${Date.now()}`;
    const uploaded = totalChunks - pendingChunks;
    const progress = totalChunks > 0 ? Math.round((uploaded / totalChunks) * 100) : 0;
    // Create a stub File object for display purposes
    const stubFile = new File([], name, { type: "application/octet-stream" });
    Object.defineProperty(stubFile, "size", { value: size });
    set((state) => ({
      queue: [
        ...state.queue,
        {
          id,
          file: stubFile,
          fileId,
          status: active ? ("uploading" as const) : ("paused" as const),
          progress: 70 + (25 * uploaded / totalChunks),
          stage: active ? `Uploading chunk ${uploaded}/${totalChunks}` : `Paused (${uploaded}/${totalChunks} chunks)`,
          startedAt: Date.now(),
        },
      ],
    }));
  },
}));
