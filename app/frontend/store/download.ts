import { create } from "zustand";
import { toast } from "@/store/toast";
import { notifications } from "@/store/notifications";
import { downloadAndDecryptFile, DownloadPausedError, type DiskWritable, type DownloadResumeState } from "@/lib/download-session";
import { downloadAsZip, type BulkDownloadFile } from "@/lib/bulk-download";
import { getFilesData } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { genId } from "@/lib/id";
import { relaunchAfterPrior } from "@/lib/async/relaunch";

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

export type DownloadStatus = "queued" | "downloading" | "paused" | "done" | "failed" | "cancelled";

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

/** Set a terminal / paused status directly (bypassing the rAF throttle) AND
 *  purge any still-queued progress write for this id — otherwise a throttled
 *  frame already scheduled from the last onProgress tick lands afterward and
 *  stomps the terminal status back to "downloading". */
function setStatusNow(id: string, patch: Partial<DownloadItem> & { status: DownloadStatus }) {
  pendingUpdates.delete(id);
  useDownloadStore.setState((state) => ({
    queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

/**
 * Optional per-file password resolver, threaded through to the decrypt pipeline.
 */
export type DownloadPasswordResolver = (fileId: string) => Promise<string> | string;

function protectedFolderOf(fileId: string): string | null {
  const file = getFilesData().find((f) => f.id === fileId);
  const fid = file?.folder_id ?? null;
  if (fid && useFolderRegistry.getState().isProtected(fid)) return fid;
  return null;
}

function looksLikeWrongKey(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("decrypt") || m.includes("passphrase") || m.includes("cipher") || m.includes("wrong");
}

function recoverWrongFolderPassword(fileId: string, msg: string): boolean {
  if (!looksLikeWrongKey(msg)) return false;
  const fid = protectedFolderOf(fileId);
  if (!fid) return false;
  useFolderPasswordStore.getState().clear(fid);
  return true;
}

// Per-single-download state kept OUT of the typed queue (mirrors upload's
// itemMeta): the params needed to (re)run, the resumable pipeline state, the
// current run's abort controller, and a generation token so a stale run that's
// draining after pause can't finalize over a newer one.
interface SingleSession {
  fileId: string;
  filename: string;
  fileSize: number;
  passphrase: string;
  resolvePassword?: DownloadPasswordResolver;
  resume: DownloadResumeState;
  abort: AbortController;
  runToken: symbol;
  runPromise?: Promise<void>;
}
const sessions = new Map<string, SingleSession>();
// Ids the user has paused — the pipeline's `pausing()` reads this to preserve
// state (keep the disk writable open) instead of discarding on abort.
const pausedIds = new Set<string>();

// A ZIP download has no resume pipeline; it keeps just an abort controller and
// its params so a retry can restart it.
interface ZipSession {
  files: BulkDownloadFile[];
  passphrase: string;
  resolvePassword?: DownloadPasswordResolver;
  abort: AbortController;
}
const zipSessions = new Map<string, ZipSession>();

interface DownloadStore {
  queue: DownloadItem[];
  startDownload: (fileId: string, filename: string, fileSize: number, passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  /** Desktop-only: download through the in-process Rust core. The core streams
   *  chunks straight to a native-picked path on disk (bounded memory) and pulls
   *  byos-direct from the user's own storage when creds exist — unlike the
   *  browser pipeline, which buffers the whole file in the webview (a multi-GB
   *  file there OOMs and freezes the app, since WKWebView has no
   *  showSaveFilePicker to stream with). */
  startDesktopDownload: (fileId: string, filename: string, fileSize: number, passphrase: string, userId: string, resolvePassword?: DownloadPasswordResolver) => void;
  startBulkZipDownload: (files: BulkDownloadFile[], passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string, passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  /** Resume single-file downloads that died mid-transfer (tab suspended /
   *  network drop), reusing each session's own passphrase + resume state.
   *  Called when the tab returns to visible or the network reconnects. */
  autoResumeInterrupted: () => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string, passphrase: string, resolvePassword?: DownloadPasswordResolver) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
}

// A download that FAILED for a transient reason (network drop / suspended tab)
// is safe to auto-resume; one that failed on a crypto/auth problem is NOT — it
// would just re-fail (and re-toast) on every tab focus. Unknown → assume
// transient (network is the overwhelmingly common interruption cause).
function isTransientDownloadFailure(error?: string): boolean {
  if (!error) return true;
  return !/integrity|corrupt|hash|password|passphrase|decrypt|wrong key/i.test(error);
}

function updateProgress(id: string, status: DownloadStatus, progress?: number, stage?: string) {
  if (status === "done" || status === "failed" || status === "cancelled" || status === "paused") {
    setStatusNow(id, { status, ...(progress !== undefined ? { progress } : {}), ...(stage !== undefined ? { stage } : {}) });
    return;
  }
  pendingUpdates.set(id, { status, progress, stage });
  scheduleFlush();
}

// Execute one run of a single-file download from its session. Shared by
// start / resume / retry — each gives the session a fresh abort controller +
// run token, then interprets the outcome (done / paused / cancelled / failed).
function runSingleDownload(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return Promise.resolve();

  const abort = new AbortController();
  const runToken = Symbol("dlRun");
  session.abort = abort;
  session.runToken = runToken;
  const isCurrentRun = () => sessions.get(id)?.runToken === runToken;

  const p = (async () => {
    try {
      updateProgress(id, "downloading", undefined, "Starting...");
      await downloadAndDecryptFile(session.fileId, session.passphrase, {
        onProgress: (info) => {
          // A stale draining run (after pause/resume replaced it) must not paint
          // the row; and a paused row must not be flipped back to "downloading".
          if (!isCurrentRun() || pausedIds.has(id)) return;
          updateProgress(id, "downloading", info.percent, info.stage);
        },
        signal: abort.signal,
        resolvePassword: session.resolvePassword ?? resolveFilePasswordGlobal,
        resume: session.resume,
        pausing: () => pausedIds.has(id),
      });

      if (!isCurrentRun()) return;
      updateProgress(id, "done", 100, "Done");
      sessions.delete(id);
      pausedIds.delete(id);
      toast.success(`${session.filename} downloaded`);
      notifications.downloadComplete(session.filename);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.hidden) {
        const n = new Notification("Download complete", { body: session.filename, icon: "/favicon.ico", tag: "download-done" });
        setTimeout(() => n.close(), 5000);
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (err) {
      if (err instanceof DownloadPausedError) {
        // Keep the session (resume state intact); the row shows "paused".
        const item = useDownloadStore.getState().queue.find((i) => i.id === id);
        updateProgress(id, "paused", item?.progress, "Paused");
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        // Explicit cancel: the pipeline already aborted the disk file.
        sessions.delete(id);
        pausedIds.delete(id);
        updateProgress(id, "cancelled", undefined, "Cancelled");
        return;
      }
      if (!isCurrentRun()) return;
      const msg = err instanceof Error ? err.message : "Download failed";
      // Keep the session so Retry continues from what's already decrypted.
      const recovered = recoverWrongFolderPassword(session.fileId, msg);
      setStatusNow(id, { status: "failed", error: msg, stage: "Failed" });
      if (recovered) {
        toast.error(`Wrong folder password for ${session.filename}. Retry to re-enter it.`);
      } else {
        toast.error(`Download failed: ${msg}`);
      }
      notifications.downloadFailed(session.filename, msg);
    }
  })();

  session.runPromise = p;
  return p;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],

  startDownload: (fileId, filename, fileSize, passphrase, resolvePassword) => {
    const id = genId("dl");

    set((state) => ({
      queue: [
        ...state.queue,
        { id, fileId, filename, fileSize, status: "queued" as const, progress: 0, stage: "Queued", startedAt: Date.now() },
      ],
    }));

    void (async () => {
      const resume: DownloadResumeState = {};

      // Large file → stream straight to disk. The Save-As picker MUST be called
      // on the click's activation (before any other await), so it's the very
      // first thing here. User cancels the dialog → cancel the download; an
      // unsupported browser / lost gesture → fall back to the in-memory path.
      const picker = getSaveFilePicker();
      if (fileSize >= STREAM_TO_DISK_MIN_BYTES && picker) {
        try {
          const handle = await picker({ suggestedName: filename });
          resume.saveToDisk = await handle.createWritable();
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            updateProgress(id, "cancelled", undefined, "Cancelled");
            return;
          }
          // unsupported / gesture lost → in-memory fallback
        }
      }

      sessions.set(id, {
        fileId,
        filename,
        fileSize,
        passphrase,
        resolvePassword,
        resume,
        abort: new AbortController(),
        runToken: Symbol("dlRun"),
      });
      await runSingleDownload(id);
    })();
  },

  startDesktopDownload: (fileId, filename, fileSize, passphrase, userId, resolvePassword) => {
    // Dedup: never run two transfers for the same file at once (the racing
    // duplicate downloads that clobbered one temp file and froze the app).
    const alreadyActive = get().queue.some(
      (i) => i.fileId === fileId && (i.status === "downloading" || i.status === "queued" || i.status === "paused")
    );
    if (alreadyActive) return;

    const id = genId("dl");
    set((state) => ({
      queue: [
        ...state.queue,
        { id, fileId, filename, fileSize, status: "queued" as const, progress: 0, stage: "Choose where to save…", startedAt: Date.now() },
      ],
    }));

    void (async () => {
      const { sidecarDownload, pickSaveLocation, subscribeProgress } = await import("@/lib/tauri");

      // Native save dialog — MUST resolve to a path before the core can stream.
      let savePath: string | null;
      try {
        savePath = await pickSaveLocation(filename);
      } catch {
        savePath = null;
      }
      if (!savePath) {
        setStatusNow(id, { status: "cancelled", stage: "Cancelled" });
        return;
      }

      // Resolve the effective passphrase (folder password for a protected file,
      // else the vault passphrase) up front — the core can't call back into JS.
      let effectivePass = passphrase;
      try {
        if (resolvePassword) effectivePass = await resolvePassword(fileId);
      } catch {
        /* fall back to the vault passphrase */
      }

      // Live progress: the core emits zcrypt://progress carrying the file_id, so
      // we match on that (unlike upload, which can only match on file name).
      const unlisten = await subscribeProgress((p) => {
        if (p.file_id !== fileId) return;
        const percent = p.bytes_total > 0 ? Math.round((p.bytes_done / p.bytes_total) * 100) : undefined;
        updateProgress(id, "downloading", percent, p.stage);
      });

      try {
        updateProgress(id, "downloading", 0, "Starting…");
        await sidecarDownload(fileId, effectivePass, userId, savePath);
        setStatusNow(id, { status: "done", progress: 100, stage: "Done" });
        toast.success(`${filename} downloaded`);
        notifications.downloadComplete(filename);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // A DNS/connect failure means we couldn't even reach zcrypt's servers —
        // common on filtered/censored networks. Give the actionable hint (check
        // connection / try a VPN) instead of a raw reqwest dump.
        const isNetwork = /error sending request|dns error|failed to lookup|client error \(connect\)|timed out|connection reset|connection refused/i.test(msg);
        const recovered = recoverWrongFolderPassword(fileId, msg);
        setStatusNow(id, { status: "failed", error: isNetwork ? "Can't reach zcrypt's servers (network/DNS)" : msg, stage: "Failed" });
        if (isNetwork) {
          toast.error(`Can't reach zcrypt's servers — check your internet, and if you're on a restricted or filtered network, connect a VPN and retry.`);
        } else if (recovered) {
          toast.error(`Wrong folder password for ${filename}. Retry to re-enter it.`);
        } else {
          toast.error(`Download failed: ${msg}`);
        }
        notifications.downloadFailed(filename, isNetwork ? "Network/DNS — try a VPN" : msg);
      } finally {
        unlisten();
      }
    })();
  },

  startBulkZipDownload: (files, passphrase, resolvePassword) => {
    const id = genId("zip");
    const controller = new AbortController();
    const totalSize = files.reduce((s, f) => s + f.fileSize, 0);

    set((state) => ({
      queue: [
        ...state.queue,
        { id, fileId: "zip", filename: `${files.length} files as ZIP`, fileSize: totalSize, status: "queued" as const, progress: 0, stage: "Queued", startedAt: Date.now() },
      ],
    }));
    zipSessions.set(id, { files, passphrase, resolvePassword, abort: controller });

    void (async () => {
      try {
        updateProgress(id, "downloading", 0, "Starting ZIP...");
        await downloadAsZip(files, passphrase, {
          onProgress: (info) => updateProgress(id, "downloading", info.percent, info.stage),
          signal: controller.signal,
          resolvePassword: resolvePassword ?? resolveFilePasswordGlobal,
        });

        updateProgress(id, "done", 100, "Done");
        zipSessions.delete(id);
        toast.success(`ZIP with ${files.length} files downloaded`);
        notifications.downloadComplete(`${files.length} files (ZIP)`);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          zipSessions.delete(id);
          updateProgress(id, "cancelled", undefined, "Cancelled");
          return;
        }
        const msg = err instanceof Error ? err.message : "ZIP download failed";
        let recovered = false;
        if (looksLikeWrongKey(msg)) {
          for (const f of files) {
            if (recoverWrongFolderPassword(f.fileId, msg)) recovered = true;
          }
        }
        setStatusNow(id, { status: "failed", error: msg, stage: "Failed" });
        if (recovered) {
          toast.error("Wrong folder password in this ZIP. Retry to re-enter it.");
        } else {
          toast.error(`ZIP download failed: ${msg}`);
        }
      }
    })();
  },

  // Pause a running single-file download: flag it, then abort the run's
  // in-flight fetches. The pipeline sees pausing()===true and throws
  // DownloadPausedError instead of discarding — the disk writable stays open
  // and the resume state (decrypted-so-far / high-water mark) is preserved.
  pauseDownload: (id) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item || item.status === "done" || item.status === "failed" || item.status === "cancelled" || item.status === "paused") return;
    if (!sessions.has(id)) return; // ZIP downloads aren't pausable
    pausedIds.add(id);
    sessions.get(id)!.abort.abort();
    updateProgress(id, "paused", item.progress, "Paused");
  },

  // Resume a paused download: clear the flag, wait for the old run to fully
  // settle (its aborted fetches reject promptly), then run again — the pipeline
  // continues from the resume state on the same open disk writable.
  resumeDownload: (id, passphrase, resolvePassword) => {
    const session = sessions.get(id);
    if (!session) return;
    pausedIds.delete(id);
    session.passphrase = passphrase;
    if (resolvePassword) session.resolvePassword = resolvePassword;
    set((state) => ({
      queue: state.queue.map((i) => (i.id === id ? { ...i, status: "downloading" as const, stage: "Resuming…", error: undefined } : i)),
    }));
    const prior = session.runPromise;
    relaunchAfterPrior(prior, () => runSingleDownload(id));
  },

  // Auto-resume single-file downloads that died mid-transfer (tab suspended /
  // network drop). Reuses each session's OWN stored passphrase + resume state
  // (decrypted-so-far / disk high-water mark) — no re-prompt. Skips ZIP
  // downloads (no resume pipeline / session gone) and permanent crypto/auth
  // failures that would only re-fail. Idempotent: sets status to "downloading"
  // synchronously, so a second call skips anything already resuming.
  autoResumeInterrupted: () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const failed = get().queue.filter((i) => i.status === "failed");
    for (const item of failed) {
      const session = sessions.get(item.id);
      if (!session) continue; // ZIP or discarded session — nothing to resume from
      if (!isTransientDownloadFailure(item.error)) continue; // permanent — don't loop
      pausedIds.delete(item.id);
      set((state) => ({
        queue: state.queue.map((i) =>
          i.id === item.id ? { ...i, status: "downloading" as const, stage: "Resuming…", error: undefined } : i
        ),
      }));
      const prior = session.runPromise;
      relaunchAfterPrior(prior, () => runSingleDownload(item.id));
    }
  },

  cancelDownload: (id) => {
    // Explicit stop. Not a pause (pausedIds stays clear), so the pipeline aborts
    // the disk file and the run lands "cancelled".
    pausedIds.delete(id);
    sessions.get(id)?.abort.abort();
    zipSessions.get(id)?.abort.abort();
  },

  retryDownload: (id, passphrase, resolvePassword) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;

    const session = sessions.get(id);
    if (session) {
      // Single download: continue from what's already decrypted, don't restart.
      pausedIds.delete(id);
      session.passphrase = passphrase;
      if (resolvePassword) session.resolvePassword = resolvePassword;
      set((state) => ({
        queue: state.queue.map((i) => (i.id === id ? { ...i, status: "downloading" as const, stage: "Retrying…", error: undefined } : i)),
      }));
      const prior = session.runPromise;
      relaunchAfterPrior(prior, () => runSingleDownload(id));
      return;
    }

    // ZIP download (no resume pipeline): restart it fresh.
    const zip = zipSessions.get(id);
    if (zip) {
      get().removeFromQueue(id);
      get().startBulkZipDownload(zip.files, passphrase, resolvePassword ?? zip.resolvePassword);
      return;
    }

    // Fallback (session already gone): restart a plain single download.
    get().removeFromQueue(id);
    get().startDownload(item.fileId, item.filename, item.fileSize, passphrase, resolvePassword);
  },

  removeFromQueue: (id) => {
    // Explicit dismiss/cancel: abort the run AND discard any partial disk file
    // that a pause/failure left open, so we never strand a locked writable.
    const session = sessions.get(id);
    if (session) {
      pausedIds.delete(id);
      session.abort.abort();
      const disk = session.resume.saveToDisk;
      if (disk?.abort) { void disk.abort().catch(() => {}); }
      sessions.delete(id);
    }
    const zip = zipSessions.get(id);
    if (zip) { zip.abort.abort(); zipSessions.delete(id); }

    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }));
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter((item) => item.status !== "done" && item.status !== "cancelled"),
    }));
  },
}));
