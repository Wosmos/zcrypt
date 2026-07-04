import { create } from "zustand";
import { toast } from "@/store/toast";
import { notifications } from "@/store/notifications";
import { downloadAndDecryptFile, type DiskWritable } from "@/lib/download-session";
import { downloadAsZip, type BulkDownloadFile } from "@/lib/bulk-download";
import { getFilesData } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";

// Files at/above this size stream to disk (a Save-As prompt) instead of being
// assembled in memory — the only way to download something too big to hold in a
// browser tab. Smaller files keep the silent, no-prompt download.
const STREAM_TO_DISK_MIN_BYTES = 1024 * 1024 * 1024; // 1 GB

// showSaveFilePicker isn't in the default TS DOM lib — declare the bit we use.
interface SaveFilePickerOptions {
  suggestedName?: string;
}
type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<{ createWritable(): Promise<DiskWritable> }>;
function getSaveFilePicker(): ShowSaveFilePicker | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
}

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

/**
 * Optional per-file password resolver, threaded through to the decrypt pipeline.
 * For a file in a password-protected folder it returns the cached folder
 * password (the caller having already unlocked the folder); for everything else
 * it returns the vault passphrase. Omitted ⇒ the plain `passphrase` is used, so
 * unprotected downloads are byte-for-byte unchanged.
 */
export type DownloadPasswordResolver = (fileId: string) => Promise<string> | string;

// True iff `fileId` lives in a folder known to be password-protected. Used to
// scope the wrong-password recovery (clear-cache + re-prompt) to protected files
// only — unprotected files keep the existing vault wrong-passphrase flow.
function protectedFolderOf(fileId: string): string | null {
  const file = getFilesData().find((f) => f.id === fileId);
  const fid = file?.folder_id ?? null;
  if (fid && useFolderRegistry.getState().isProtected(fid)) return fid;
  return null;
}

// Heuristic match for a wrong/stale-key decrypt failure (mirrors the preview
// recovery in useVaultActions). The decrypt pipelines surface AES-GCM failures
// as "Decryption failed — wrong passphrase?".
function looksLikeWrongKey(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("decrypt") || m.includes("passphrase") || m.includes("cipher") || m.includes("wrong");
}

// On a wrong-password failure for a PROTECTED-folder file, clear that folder's
// cached password (FIX-4) so the next attempt re-prompts + re-verifies — exactly
// like the preview recovery. Returns true if it was a protected-folder
// wrong-key case (so the caller can show a re-prompt hint instead of a generic
// failure toast). Unprotected files are left to the existing vault flow.
function recoverWrongFolderPassword(fileId: string, msg: string): boolean {
  if (!looksLikeWrongKey(msg)) return false;
  const fid = protectedFolderOf(fileId);
  if (!fid) return false;
  useFolderPasswordStore.getState().clear(fid);
  return true;
}

interface DownloadStore {
  queue: DownloadItem[];
  // Map of download id -> AbortController (for cancellation)
  controllers: Map<string, AbortController>;
  startDownload: (fileId: string, filename: string, fileSize: number, passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  startBulkZipDownload: (files: BulkDownloadFile[], passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string, passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
}

let counter = 0;

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],
  controllers: new Map(),

  startDownload: (fileId, filename, fileSize, passphrase, resolvePassword) => {
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

      // Large file → stream straight to disk. The Save-As picker MUST be called
      // on the click's activation (before any other await), so it's the very
      // first thing here. User cancels the dialog → cancel the download; an
      // unsupported browser / lost gesture → fall back to the in-memory path.
      let disk: DiskWritable | undefined;
      const picker = getSaveFilePicker();
      if (fileSize >= STREAM_TO_DISK_MIN_BYTES && picker) {
        try {
          const handle = await picker({ suggestedName: filename });
          disk = await handle.createWritable();
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            updateProgress("cancelled", undefined, "Cancelled");
            return;
          }
          disk = undefined; // unsupported / gesture lost → in-memory fallback
        }
      }

      try {
        updateProgress("downloading", 0, "Starting...");

        // FIX-4: route decryption through the folder-aware resolver. The page
        // passes its prompting resolver; callers without one (e.g. the transfer
        // manager retry) fall back to the global non-prompting resolver so a
        // protected-folder file still uses its folder password, not the vault pass.
        await downloadAndDecryptFile(fileId, passphrase, {
          onProgress: (info) => {
            updateProgress("downloading", info.percent, info.stage);
          },
          signal: controller.signal,
          resolvePassword: resolvePassword ?? resolveFilePasswordGlobal,
          saveToDisk: disk,
        });

        updateProgress("done", 100, "Done");
        toast.success(`${filename} downloaded`);
        notifications.downloadComplete(filename);

        // Web notification when tab is hidden
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.hidden) {
          const n = new Notification("Download complete", { body: filename, icon: "/favicon.ico", tag: "download-done" });
          setTimeout(() => n.close(), 5000);
          n.onclick = () => { window.focus(); n.close(); };
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateProgress("cancelled", undefined, "Cancelled");
          return;
        }
        const msg = err instanceof Error ? err.message : "Download failed";
        // FIX-4: wrong/stale password on a PROTECTED-folder file → clear that
        // folder's cache so a retry re-prompts + re-verifies (mirrors the preview
        // recovery), and surface a re-prompt hint instead of a generic failure.
        const recovered = recoverWrongFolderPassword(fileId, msg);
        // This branch sets state directly instead of through updateProgress(),
        // so it must also purge any still-queued throttled write for this id —
        // otherwise a requestAnimationFrame flush already in flight from the
        // last onProgress call lands afterward and stomps this failed status
        // back to "downloading" (see updateProgress's done/cancelled branch,
        // which does the same delete).
        pendingUpdates.delete(id);
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, status: "failed" as const, error: msg, stage: "Failed" } : item
          ),
        }));
        if (recovered) {
          toast.error(`Wrong folder password for ${filename}. Retry to re-enter it.`);
        } else {
          toast.error(`Download failed: ${msg}`);
        }
        notifications.downloadFailed(filename, msg);
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

  startBulkZipDownload: (files, passphrase, resolvePassword) => {
    const id = `zip_${++counter}_${Date.now()}`;
    const controller = new AbortController();
    const totalSize = files.reduce((s, f) => s + f.fileSize, 0);

    set((state) => ({
      queue: [
        ...state.queue,
        {
          id,
          fileId: "zip",
          filename: `${files.length} files as ZIP`,
          fileSize: totalSize,
          status: "queued" as const,
          progress: 0,
          stage: "Queued",
          startedAt: Date.now(),
        },
      ],
      controllers: new Map(state.controllers).set(id, controller),
    }));

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
        updateProgress("downloading", 0, "Starting ZIP...");

        // FIX-4: same folder-aware resolver as single download, with the global
        // fallback so each file in the ZIP uses its own folder password.
        await downloadAsZip(files, passphrase, {
          onProgress: (info) => {
            updateProgress("downloading", info.percent, info.stage);
          },
          signal: controller.signal,
          resolvePassword: resolvePassword ?? resolveFilePasswordGlobal,
        });

        updateProgress("done", 100, "Done");
        toast.success(`ZIP with ${files.length} files downloaded`);
        notifications.downloadComplete(`${files.length} files (ZIP)`);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateProgress("cancelled", undefined, "Cancelled");
          return;
        }
        const msg = err instanceof Error ? err.message : "ZIP download failed";
        // FIX-4: a wrong-key failure inside the ZIP → clear the cache of every
        // protected folder among the bulk files so a retry re-prompts for the
        // right password(s). Unprotected-only ZIPs are unaffected.
        let recovered = false;
        if (looksLikeWrongKey(msg)) {
          for (const f of files) {
            if (recoverWrongFolderPassword(f.fileId, msg)) recovered = true;
          }
        }
        // Same stale-frame hazard as the single-file failure path — purge the
        // pending throttled write before setting state directly.
        pendingUpdates.delete(id);
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, status: "failed" as const, error: msg, stage: "Failed" } : item
          ),
        }));
        if (recovered) {
          toast.error("Wrong folder password in this ZIP. Retry to re-enter it.");
        } else {
          toast.error(`ZIP download failed: ${msg}`);
        }
      } finally {
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

  retryDownload: (id, passphrase, resolvePassword) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;

    // Remove old entry
    get().removeFromQueue(id);

    // Start fresh
    get().startDownload(item.fileId, item.filename, item.fileSize, passphrase, resolvePassword);
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
