import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";

interface UploadStore {
  queue: UploadItem[];
  addToQueue: (file: File) => string;
  updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string) => void;
  setError: (id: string, error: string) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
}

let counter = 0;

export const useUploadStore = create<UploadStore>((set) => ({
  queue: [],

  addToQueue: (file: File) => {
    const id = `upload_${++counter}_${Date.now()}`;
    set((state) => ({
      queue: [
        ...state.queue,
        { id, file, status: "queued", progress: 0, stage: "Queued" },
      ],
    }));
    return id;
  },

  updateStatus: (id, status, progress, stage) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              progress: progress ?? item.progress,
              stage: stage ?? item.stage,
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
}));
