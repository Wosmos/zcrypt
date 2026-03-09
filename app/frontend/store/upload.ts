import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";
import { pushFile } from "@/lib/api";
import { toast } from "@/store/toast";

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
  startUpload: (files: File[], passphrase: string, platform?: string, maxConcurrent?: number, onRefresh?: () => void) => void;
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

  startUpload: (files, passphrase, platform, maxConcurrent = 2, onRefresh) => {
    const { addToQueue, updateStatus, setFileId, setError } = get();

    // Add all files to queue immediately so UI shows them all
    const items = files.map((file) => ({
      file,
      id: addToQueue(file),
    }));

    // Process a single file
    const processOne = async (file: File, id: string) => {
      updateStatus(id, "sending", 0, "Sending to server");
      try {
        const result = await pushFile(file, passphrase, platform, (percent) => {
          const { queue } = get();
          const item = queue.find((i) => i.id === id);
          if (item && item.status === "sending") {
            updateStatus(id, "sending", percent, "Sending to server");
          }
        });

        const res = result as { file_id?: string; status?: string };
        if (res.file_id) {
          setFileId(id, res.file_id);
          updateStatus(id, "compressing", 65, "Processing on server...");
        } else {
          updateStatus(id, "done", 100, "Done");
          toast.success(`${file.name} uploaded`);
          onRefresh?.();
        }
      } catch (err) {
        setError(id, err instanceof Error ? err.message : "Upload failed");
        toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    // Semaphore-based concurrency limiter
    let running = 0;
    const waiting: (() => void)[] = [];

    const acquire = async () => {
      if (running < maxConcurrent) {
        running++;
        return;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
    };

    const release = () => {
      running--;
      const next = waiting.shift();
      if (next) {
        running++;
        next();
      }
    };

    // Fire-and-forget: launch all uploads with concurrency control
    // This runs detached from the component — survives navigation
    void Promise.all(
      items.map(async ({ file, id }) => {
        await acquire();
        try {
          await processOne(file, id);
        } finally {
          release();
        }
      })
    );
  },
}));
