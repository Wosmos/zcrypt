import { create } from "zustand";
import { toast } from "@/store/toast";
import { downloadAndDecryptFile } from "@/lib/download-session";

export type DownloadStatus = "queued" | "downloading" | "done" | "failed" | "cancelled";

export interface DownloadItem {
  id: string;
  fileId: string;
  filename: string;
  fileSize: number;
  status: DownloadStatus;
  progress: number;
  stage: string;
  error?: string;
  startedAt: number;
}

// --- Throttled progress updates (same pattern as upload store) ---
const pendingUpdates = new Map<string, { status: DownloadStatus; progress?: number; stage?: string }>();
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    if (pendingUpdates.size === 0) return;
    const updates = new Map(pendingUpdates);
    pendingUpdates.clear();
    useDownloadStore.setState((state) => ({
      queue: state.queue.map((item) => {
        const u = updates.get(item.id);
        if (!u) return item;
        return {
          ...item,
          status: u.status,
          progress: u.progress ?? item.progress,
          stage: u.stage ?? item.stage,
        };
      }),
    }));
  });
}

interface DownloadStore {
  queue: DownloadItem[];
  // Map of download id -> AbortController (for cancellation)
  controllers: Map<string, AbortController>;
  startDownload: (fileId: string, filename: string, fileSize: number, passphrase: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string, passphrase: string) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
}

let counter = 0;

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],
  controllers: new Map(),

  startDownload: (fileId, filename, fileSize, passphrase) => {
    const id = `dl_${++counter}_${Date.now()}`;
    const controller = new AbortController();

    set((state) => ({
      queue: [
        ...state.queue,
        {
          id,
          fileId,
          filename,
          fileSize,
          status: "queued" as const,
          progress: 0,
          stage: "Queued",
          startedAt: Date.now(),
        },
      ],
      controllers: new Map(state.controllers).set(id, controller),
    }));

    // Fire and forget
    void (async () => {
      const updateProgress = (status: DownloadStatus, progress?: number, stage?: string) => {
        if (status === "done" || status === "failed" || status === "cancelled") {
          pendingUpdates.delete(id);
          set((state) => ({
            queue: state.queue.map((item) =>
              item.id === id
                ? { ...item, status, progress: progress ?? item.progress, stage: stage ?? item.stage }
                : item
            ),
          }));
          return;
        }
        pendingUpdates.set(id, { status, progress, stage });
        scheduleFlush();
      };

      try {
        updateProgress("downloading", 0, "Starting...");

        await downloadAndDecryptFile(fileId, passphrase, {
          onProgress: (info) => {
            updateProgress("downloading", info.percent, info.stage);
          },
          signal: controller.signal,
        });

        updateProgress("done", 100, "Done");
        toast.success(`${filename} downloaded`);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateProgress("cancelled", undefined, "Cancelled");
          return;
        }
        const msg = err instanceof Error ? err.message : "Download failed";
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, status: "failed" as const, error: msg, stage: "Failed" } : item
          ),
        }));
        toast.error(`Download failed: ${msg}`);
      } finally {
        // Clean up controller
        set((state) => {
          const controllers = new Map(state.controllers);
          controllers.delete(id);
          return { controllers };
        });
      }
    })();
  },

  cancelDownload: (id) => {
    const { controllers } = get();
    const controller = controllers.get(id);
    if (controller) {
      controller.abort();
    }
  },

  retryDownload: (id, passphrase) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;

    // Remove old entry
    get().removeFromQueue(id);

    // Start fresh
    get().startDownload(item.fileId, item.filename, item.fileSize, passphrase);
  },

  removeFromQueue: (id) => {
    // Cancel if still running
    const { controllers } = get();
    const controller = controllers.get(id);
    if (controller) controller.abort();

    set((state) => {
      const newControllers = new Map(state.controllers);
      newControllers.delete(id);
      return {
        queue: state.queue.filter((item) => item.id !== id),
        controllers: newControllers,
      };
    });
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter((item) => item.status !== "done" && item.status !== "cancelled"),
    }));
  },
}));
