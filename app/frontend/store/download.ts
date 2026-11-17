import { create } from "zustand";
import { tr } from "@/store/translate";
import { toast } from "@/store/toast";
import { notifications } from "@/store/notifications";
import { failureReason, notify } from "@/lib/notify";
import {
  downloadAndDecryptFile,
  DownloadPausedError,
  type DiskWritable,
  type DownloadOptions,
  type DownloadResumeState,
} from "@/lib/download-session";
import {
  createZipRun,
  downloadAsZip,
  ZipPausedError,
  zipRefusal,
  type BulkDownloadFile,
  type ZipRun,
} from "@/lib/bulk-download";
import { getFilesData } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { genId } from "@/lib/id";
import { desktopAppAction } from "@/lib/open-desktop-app";
import { DownloadStatus } from "@/types";
import { relaunchAfterPrior } from "@/lib/async/relaunch";
import {
  STREAM_TO_DISK_MIN_BYTES,
  ZIP_IN_MEMORY_MAX_BYTES,
  getSaveFilePicker,
  canStreamToDisk,
} from "@/lib/disk-save";

import { createFrameBatch } from "@/lib/frame-batch";
import { createAutoResumeBudget } from "@/lib/auto-resume";
import { isTransientError } from "@/lib/retry";
import { AUTO_RESUME_MAX_ATTEMPTS, FAILED_BUFFER_GRACE_MS } from "@/lib/transport";

export { canStreamToDisk };

function notifyZipDone(count: number, failed: number) {
  void notify({ type: "transferDone", kind: "download", count, failed, folder: "" });
}

export { ZIP_IN_MEMORY_MAX_BYTES };

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
const progressBatch = createFrameBatch<{
  status: DownloadStatus;
  progress?: number;
  stage?: string;
}>((updates) =>
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
  })),
);

/** The single queue row a bulk ZIP download shows while it runs. */
function zipQueueItem(id: string, count: number, totalSize: number, stage: string): DownloadItem {
  return {
    id,
    fileId: "zip",
    filename: `${count} files as ZIP`,
    fileSize: totalSize,
    status: DownloadStatus.Queued,
    progress: 0,
    stage,
    startedAt: Date.now(),
  };
}

/** Set a terminal / paused status directly (bypassing the rAF throttle) AND
 *  purge any still-queued progress write for this id: otherwise a throttled
 *  frame already scheduled from the last onProgress tick lands afterward and
 *  stomps the terminal status back to "downloading". */
function setStatusNow(id: string, patch: Partial<DownloadItem> & { status: DownloadStatus }) {
  progressBatch.drop(id);
  useDownloadStore.setState((state) => ({
    queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

/**
 * Optional per-file password resolver, threaded through to the decrypt pipeline.
 */
export type DownloadPasswordResolver = (fileId: string) => Promise<string> | string;

/** Supplies the file key directly (shared-space files), bypassing passphrases. */
export type ResolveKey = NonNullable<DownloadOptions["resolveKey"]>;

function protectedFolderOf(fileId: string): string | null {
  const file = getFilesData().find((f) => f.id === fileId);
  const fid = file?.folder_id ?? null;
  if (fid && useFolderRegistry.getState().isProtected(fid)) return fid;
  return null;
}

function looksLikeWrongKey(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("decrypt") || m.includes("passphrase") || m.includes("cipher") || m.includes("wrong")
  );
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
  resolveKey?: ResolveKey;
  resume: DownloadResumeState;
  abort: AbortController;
  runToken: symbol;
  runPromise?: Promise<void>;
  /** Whether the last failure was transient (worth an automatic resume). */
  transient?: boolean;
  /** Frees the decrypted chunks of a failed in-memory session after a grace. */
  graceTimer?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, SingleSession>();
// Ids the user has paused: the pipeline's `pausing()` reads this to preserve
// state (keep the disk writable open) instead of discarding on abort.
const pausedIds = new Set<string>();
const cancelledIds = new Set<string>();
const autoBudget = createAutoResumeBudget();

// A failed in-memory session keeps its decrypted chunks so a retry continues
// from them. Held indefinitely they pin the whole file in tab memory, so they
// are freed once the failure is final, or after a grace for a transient one.
// Resume metadata (meta, key, disk writable and write high-water mark) stays.
function dropChunkBuffers(session: SingleSession) {
  clearTimeout(session.graceTimer);
  session.graceTimer = undefined;
  session.resume.decryptedChunks = undefined;
  session.resume.done = undefined;
}

// A ZIP download has no resume pipeline; it keeps just an abort controller and
// its params so a retry can restart it.
interface ZipSession {
  files: BulkDownloadFile[];
  passphrase: string;
  resolvePassword?: DownloadPasswordResolver;
  abort: AbortController;
  /** A browser run's open archive, kept across a pause. Absent for the desktop core path, which cannot pause. */
  run?: ZipRun;
  /** The settling run, so a resume starts only after the paused one let go. */
  runPromise?: Promise<void>;
  /** Present only for a desktop-originated session, lets retry re-invoke the
   *  core path instead of the browser one. */
  userId?: string;
}
const zipSessions = new Map<string, ZipSession>();

const zipPausedIds = new Set<string>();

async function runBrowserZip(id: string): Promise<void> {
  const session = zipSessions.get(id);
  if (!session?.run) return;
  const { files, passphrase, resolvePassword, run } = session;
  const controller = session.abort;
  try {
    updateProgress(id, DownloadStatus.Downloading, 0, "Starting ZIP...");
    const report = await downloadAsZip(files, passphrase, {
      onProgress: (info) => {
        if (zipPausedIds.has(id)) return;
        updateProgress(id, DownloadStatus.Downloading, info.percent, info.stage);
      },
      signal: controller.signal,
      resolvePassword: resolvePassword ?? resolveFilePasswordGlobal,
      run,
      pausing: () => zipPausedIds.has(id),
    });

    updateProgress(id, DownloadStatus.Done, 100, "Done");
    zipSessions.delete(id);
    notifications.downloadComplete(tr("toasts.zipFilesLabel", { count: report.added }));
    notifyZipDone(report.added, report.failed.length);
    if (report.failed.length === 0) {
      toast.success(tr("toasts.zipDone", { count: files.length }), {
        sound: { event: "done", area: "transfers" },
      });
      return;
    }
    for (const f of report.failed) {
      if (looksLikeWrongKey(f.error)) recoverWrongFolderPassword(f.fileId, f.error);
    }
    const names = report.failed.map((f) => f.filename).join(", ");
    toast.warning(
      tr("toasts.zipPartial", { failed: report.failed.length, total: files.length, names }),
      { sound: { event: "headsUp", area: "transfers" } },
    );
  } catch (err) {
    if (err instanceof ZipPausedError) return;
    if (err instanceof DOMException && err.name === "AbortError") {
      zipSessions.delete(id);
      zipPausedIds.delete(id);
      updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
      return;
    }
    const msg = err instanceof Error ? err.message : tr("toasts.zipFailed");
    let recovered = false;
    if (looksLikeWrongKey(msg)) {
      for (const f of files) {
        if (recoverWrongFolderPassword(f.fileId, msg)) recovered = true;
      }
    }
    setStatusNow(id, { status: DownloadStatus.Failed, error: msg, stage: "Failed" });
    if (recovered) {
      toast.error(tr("toasts.zipWrongPassword"));
    } else {
      toast.error(tr("toasts.zipFailedMsg", { msg }));
    }
  }
}

interface DownloadStore {
  queue: DownloadItem[];
  startDownload: (
    fileId: string,
    filename: string,
    fileSize: number,
    passphrase: string,
    resolvePassword?: DownloadPasswordResolver,
    options?: { resolveKey?: ResolveKey },
  ) => void;
  /** Desktop-only: download through the in-process Rust core. The core streams
   *  chunks straight to a native-picked path on disk (bounded memory) and pulls
   *  byos-direct from the user's own storage when creds exist: unlike the
   *  browser pipeline, which buffers the whole file in the webview (a multi-GB
   *  file there OOMs and freezes the app, since WKWebView has no
   *  showSaveFilePicker to stream with). */
  startDesktopDownload: (
    fileId: string,
    filename: string,
    fileSize: number,
    passphrase: string,
    userId: string,
    resolvePassword?: DownloadPasswordResolver,
  ) => void;
  /** Desktop-only: bulk ZIP through the in-process Rust core. Streams one file
   *  at a time into the archive (bounded by the single largest file, not the
   *  sum of the whole batch), so: unlike the browser path, which holds every
   *  file's full decrypted bytes in memory before zipping: there's no 2GB
   *  total-selection cap here. */
  startDesktopBulkZipDownload: (
    files: BulkDownloadFile[],
    passphrase: string,
    userId: string,
    resolvePassword?: DownloadPasswordResolver,
  ) => void;
  startBulkZipDownload: (
    files: BulkDownloadFile[],
    passphrase: string,
    resolvePassword?: DownloadPasswordResolver,
  ) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (
    id: string,
    passphrase: string,
    resolvePassword?: DownloadPasswordResolver,
  ) => void;
  /** Resume single-file downloads that died mid-transfer (tab suspended /
   *  network drop), reusing each session's own passphrase + resume state.
   *  Called when the tab returns to visible or the network reconnects. */
  autoResumeInterrupted: () => void;
  cancelDownload: (id: string) => void;
  retryDownload: (
    id: string,
    passphrase: string,
    resolvePassword?: DownloadPasswordResolver,
  ) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
}

function updateProgress(id: string, status: DownloadStatus, progress?: number, stage?: string) {
  if (
    status === DownloadStatus.Done ||
    status === DownloadStatus.Failed ||
    status === DownloadStatus.Cancelled ||
    status === DownloadStatus.Paused
  ) {
    setStatusNow(id, {
      status,
      ...(progress !== undefined ? { progress } : {}),
      // Every terminal/paused call site below passes a literal stage string
      // ("Done" / "Paused" / "Cancelled"), and this function is module-private,
      // so the omitted-stage arm cannot be reached.
      /* v8 ignore next */
      ...(stage !== undefined ? { stage } : {}),
    });
    return;
  }
  progressBatch.queue(id, { status, progress, stage });
}

// Execute one run of a single-file download from its session. Shared by
// start / resume / retry: each gives the session a fresh abort controller +
// run token, then interprets the outcome (done / paused / cancelled / failed).
function runSingleDownload(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return Promise.resolve();

  const abort = new AbortController();
  const runToken = Symbol("dlRun");
  session.abort = abort;
  session.runToken = runToken;
  clearTimeout(session.graceTimer);
  session.graceTimer = undefined;
  const isCurrentRun = () => sessions.get(id)?.runToken === runToken;

  const p = (async () => {
    try {
      updateProgress(id, DownloadStatus.Downloading, undefined, "Starting...");
      await downloadAndDecryptFile(session.fileId, session.passphrase, {
        onProgress: (info) => {
          // A stale draining run (after pause/resume replaced it) must not paint
          // the row; and a paused row must not be flipped back to "downloading".
          if (!isCurrentRun() || pausedIds.has(id)) return;
          updateProgress(id, DownloadStatus.Downloading, info.percent, info.stage);
        },
        signal: abort.signal,
        resolvePassword: session.resolvePassword ?? resolveFilePasswordGlobal,
        resolveKey: session.resolveKey,
        resume: session.resume,
        pausing: () => pausedIds.has(id),
      });

      if (!isCurrentRun()) return;
      updateProgress(id, DownloadStatus.Done, 100, "Done");
      autoBudget.reset(id);
      sessions.delete(id);
      pausedIds.delete(id);
      toast.success(tr("toasts.downloaded", { name: session.filename }), {
        sound: { event: "done", area: "transfers" },
      });
      notifications.downloadComplete(session.filename);
      void notify({ type: "downloadDone", name: session.filename });
    } catch (err) {
      if (!isCurrentRun()) return;
      if (err instanceof DownloadPausedError) {
        if (!pausedIds.has(id)) return;
        // Keep the session (resume state intact); the row shows "paused".
        const item = useDownloadStore.getState().queue.find((i) => i.id === id);
        updateProgress(id, DownloadStatus.Paused, item?.progress, "Paused");
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        // Explicit cancel: the pipeline already aborted the disk file.
        sessions.delete(id);
        pausedIds.delete(id);
        updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
        return;
      }
      const msg = err instanceof Error ? err.message : tr("toasts.downloadFailed");
      // Keep the session so Retry continues from what's already decrypted.
      session.transient = isTransientError(err);
      if (!session.transient || autoBudget.attempts(id) >= AUTO_RESUME_MAX_ATTEMPTS) {
        dropChunkBuffers(session);
      } else {
        clearTimeout(session.graceTimer);
        session.graceTimer = setTimeout(() => {
          const live = sessions.get(id);
          const item = useDownloadStore.getState().queue.find((i) => i.id === id);
          if (live === session && item?.status === DownloadStatus.Failed) dropChunkBuffers(session);
        }, FAILED_BUFFER_GRACE_MS);
      }
      const recovered = recoverWrongFolderPassword(session.fileId, msg);
      setStatusNow(id, { status: DownloadStatus.Failed, error: msg, stage: "Failed" });
      if (recovered) {
        toast.error(tr("toasts.wrongFolderPassword", { name: session.filename }));
      } else {
        toast.error(tr("toasts.downloadFailedMsg", { msg }));
      }
      notifications.downloadFailed(session.filename, msg);
      const item = useDownloadStore.getState().queue.find((i) => i.id === id);
      const reason = failureReason("download", msg, item?.progress ?? 0);
      void notify({ type: "transferFailed", kind: "download", name: session.filename, reason });
    }
  })();

  session.runPromise = p;
  return p;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],

  startDownload: (fileId, filename, fileSize, passphrase, resolvePassword, options) => {
    const alreadyActive = get().queue.some(
      (i) =>
        i.fileId === fileId &&
        (i.status === DownloadStatus.Downloading ||
          i.status === DownloadStatus.Queued ||
          i.status === DownloadStatus.Paused),
    );
    if (alreadyActive) return;

    const id = genId("dl");

    set((state) => ({
      queue: [
        ...state.queue,
        {
          id,
          fileId,
          filename,
          fileSize,
          status: DownloadStatus.Queued,
          progress: 0,
          stage: "Queued",
          startedAt: Date.now(),
        },
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
            updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
            return;
          }
          // unsupported / gesture lost → handled below
        }
      }

      if (cancelledIds.delete(id)) {
        await resume.saveToDisk?.abort?.().catch(() => {});
        updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
        return;
      }

      // Without a disk stream (Firefox, Safari, or a lost gesture) the whole
      // file would be assembled in tab memory, which crashes the tab at this
      // size. Refuse up front instead; Retry is a fresh click, so on Chromium
      // it gets the picker.
      if (fileSize >= STREAM_TO_DISK_MIN_BYTES && !resume.saveToDisk) {
        setStatusNow(id, {
          status: DownloadStatus.Failed,
          error: "Too large to download in this browser",
          stage: "Failed",
        });
        toast.error(tr("toasts.tooLargeDownload", { name: filename }), desktopAppAction());
        return;
      }

      sessions.set(id, {
        fileId,
        filename,
        fileSize,
        passphrase,
        resolvePassword,
        resolveKey: options?.resolveKey,
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
      (i) =>
        i.fileId === fileId &&
        (i.status === DownloadStatus.Downloading ||
          i.status === DownloadStatus.Queued ||
          i.status === DownloadStatus.Paused),
    );
    if (alreadyActive) return;

    const id = genId("dl");
    set((state) => ({
      queue: [
        ...state.queue,
        {
          id,
          fileId,
          filename,
          fileSize,
          status: DownloadStatus.Queued,
          progress: 0,
          stage: "Choose where to save…",
          startedAt: Date.now(),
        },
      ],
    }));

    void (async () => {
      const { sidecarDownload, pickSaveLocation, subscribeProgress } = await import("@/lib/tauri");

      // Native save dialog. MUST resolve to a path before the core can stream.
      let savePath: string | null;
      try {
        savePath = await pickSaveLocation(filename);
      } catch {
        savePath = null;
      }
      if (!savePath) {
        setStatusNow(id, { status: DownloadStatus.Cancelled, stage: "Cancelled" });
        return;
      }

      // Resolve the effective passphrase (folder password for a protected file,
      // else the vault passphrase) up front: the core can't call back into JS.
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
        const percent =
          p.bytes_total > 0 ? Math.round((p.bytes_done / p.bytes_total) * 100) : undefined;
        updateProgress(id, DownloadStatus.Downloading, percent, p.stage);
      });

      try {
        updateProgress(id, DownloadStatus.Downloading, 0, "Starting…");
        await sidecarDownload(fileId, effectivePass, userId, savePath);
        setStatusNow(id, { status: DownloadStatus.Done, progress: 100, stage: "Done" });
        toast.success(tr("toasts.downloaded", { name: filename }), {
          sound: { event: "done", area: "transfers" },
        });
        notifications.downloadComplete(filename);
        void notify({ type: "downloadDone", name: filename });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // A DNS/connect failure means we couldn't even reach zcrypt's servers,
        // common on filtered/censored networks. Give the actionable hint (check
        // connection / try a VPN) instead of a raw reqwest dump.
        const isNetwork =
          /error sending request|dns error|failed to lookup|client error \(connect\)|timed out|connection reset|connection refused/i.test(
            msg,
          );
        const recovered = recoverWrongFolderPassword(fileId, msg);
        setStatusNow(id, {
          status: DownloadStatus.Failed,
          error: isNetwork ? "Can't reach zcrypt's servers (network/DNS)" : msg,
          stage: "Failed",
        });
        if (isNetwork) {
          toast.error(tr("toasts.unreachable"));
        } else if (recovered) {
          toast.error(tr("toasts.wrongFolderPassword", { name: filename }));
        } else {
          toast.error(tr("toasts.downloadFailedMsg", { msg }));
        }
        notifications.downloadFailed(filename, isNetwork ? tr("toasts.unreachable") : msg);
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
      queue: [...state.queue, zipQueueItem(id, files.length, totalSize, "Queued")],
    }));
    zipSessions.set(id, { files, passphrase, resolvePassword, abort: controller });

    void (async () => {
      const refusal = zipRefusal(files);
      if (refusal) {
        zipSessions.delete(id);
        setStatusNow(id, { status: DownloadStatus.Failed, error: refusal, stage: "Failed" });
        toast.error(refusal);
        return;
      }
      let saveToDisk: DiskWritable | undefined;
      const picker = getSaveFilePicker();
      if (totalSize >= STREAM_TO_DISK_MIN_BYTES && picker) {
        try {
          const handle = await picker({ suggestedName: `zcrypt-${files.length}-files.zip` });
          saveToDisk = await handle.createWritable();
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            zipSessions.delete(id);
            updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
            return;
          }
        }
      }
      if (!saveToDisk && totalSize > ZIP_IN_MEMORY_MAX_BYTES) {
        if (picker) {
          setStatusNow(id, {
            status: DownloadStatus.Failed,
            error: "Choose where to save the ZIP",
            stage: "Failed",
          });
          toast.error(tr("toasts.zipToDisk"));
          return;
        }
        zipSessions.delete(id);
        setStatusNow(id, {
          status: DownloadStatus.Failed,
          error: "Too large to ZIP in this browser",
          stage: "Failed",
        });
        toast.error(tr("toasts.zipTooLarge"));
        return;
      }

      const session = zipSessions.get(id);
      if (!session) return;
      session.run = createZipRun(saveToDisk);
      if (controller.signal.aborted) {
        zipSessions.delete(id);
        updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
        return;
      }
      session.runPromise = runBrowserZip(id);
    })();
  },

  startDesktopBulkZipDownload: (files, passphrase, userId, resolvePassword) => {
    const id = genId("zip");
    const controller = new AbortController();
    const totalSize = files.reduce((s, f) => s + f.fileSize, 0);
    set((state) => ({
      queue: [...state.queue, zipQueueItem(id, files.length, totalSize, "Choose where to save…")],
    }));
    zipSessions.set(id, { files, passphrase, resolvePassword, userId, abort: controller });

    void (async () => {
      const { sidecarBulkDownloadZip, pickSaveLocation, subscribeProgress } = await import(
        "@/lib/tauri"
      );

      let savePath: string | null;
      try {
        savePath = await pickSaveLocation(`zcrypt-${files.length}-files.zip`);
      } catch {
        savePath = null;
      }
      if (!savePath) {
        zipSessions.delete(id);
        setStatusNow(id, { status: DownloadStatus.Cancelled, stage: "Cancelled" });
        return;
      }

      // Resolve the effective passphrase per file up front (folder password
      // for a protected file, else the vault passphrase), the core can't
      // call back into JS mid-download the way the browser pipeline can.
      const resolve = resolvePassword ?? resolveFilePasswordGlobal;
      const filePassphrases = new Map<string, string>();
      for (const f of files) {
        try {
          filePassphrases.set(f.fileId, await resolve(f.fileId));
        } catch {
          filePassphrases.set(f.fileId, passphrase);
        }
      }
      const fileIds = new Set(files.map((f) => f.fileId));
      const order = files.map((f) => f.fileId);
      const unlisten = await subscribeProgress((p) => {
        if (!fileIds.has(p.file_id) || p.chunks_total <= 0) return;
        const idx = order.indexOf(p.file_id);
        // Belt-and-braces: `order` and `fileIds` are built from the same `files`
        // array and the guard above already required a `fileIds` hit, so indexOf
        // cannot miss. Kept in case those two ever stop sharing a source.
        /* v8 ignore start */
        if (idx === -1) return;
        /* v8 ignore stop */
        const innerFraction = p.chunks_done / p.chunks_total;
        const percent = Math.round(((idx + innerFraction) / files.length) * 100);
        updateProgress(
          id,
          DownloadStatus.Downloading,
          percent,
          `${p.stage} (${idx + 1}/${files.length})`,
        );
      });

      try {
        updateProgress(id, DownloadStatus.Downloading, 0, "Starting ZIP...");
        const sidecarFiles = files.map((f) => ({
          fileId: f.fileId,
          filename: f.filename,
          // Fell back to the vault passphrase above if resolution failed;
          // that lets any real auth failure surface normally per-file
          // (same recovery path as today: wrong-key detection -> clear
          // that folder's cached password) instead of silently guessing.
          // The loop above sets an entry for every file on BOTH its try and
          // catch paths, so this fallback cannot fire today.
          /* v8 ignore next */
          passphrase: filePassphrases.get(f.fileId) ?? passphrase,
        }));
        await sidecarBulkDownloadZip(sidecarFiles, userId, savePath);

        updateProgress(id, DownloadStatus.Done, 100, "Done");
        zipSessions.delete(id);
        toast.success(tr("toasts.zipDone", { count: files.length }), {
          sound: { event: "done", area: "transfers" },
        });
        notifications.downloadComplete(tr("toasts.zipFilesLabel", { count: files.length }));
        notifyZipDone(files.length, 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : tr("toasts.zipFailed");
        const isNetwork =
          /error sending request|dns error|failed to lookup|client error \(connect\)|timed out|connection reset|connection refused/i.test(
            msg,
          );
        let recovered = false;
        if (looksLikeWrongKey(msg)) {
          for (const f of files) {
            if (recoverWrongFolderPassword(f.fileId, msg)) recovered = true;
          }
        }
        setStatusNow(id, {
          status: DownloadStatus.Failed,
          error: isNetwork ? "Can't reach zcrypt's servers (network/DNS)" : msg,
          stage: "Failed",
        });
        if (isNetwork) {
          toast.error(tr("toasts.unreachable"));
        } else if (recovered) {
          toast.error(tr("toasts.zipWrongPassword"));
        } else {
          toast.error(tr("toasts.zipFailedMsg", { msg }));
        }
      } finally {
        unlisten();
      }
    })();
  },

  // Pause a running single-file download: flag it, then abort the run's
  // in-flight fetches. The pipeline sees pausing()===true and throws
  // DownloadPausedError instead of discarding: the disk writable stays open
  // and the resume state (decrypted-so-far / high-water mark) is preserved.
  pauseDownload: (id) => {
    const item = get().queue.find((i) => i.id === id);
    if (
      !item ||
      item.status === DownloadStatus.Done ||
      item.status === DownloadStatus.Failed ||
      item.status === DownloadStatus.Cancelled ||
      item.status === DownloadStatus.Paused
    )
      return;
    const zip = zipSessions.get(id);
    if (zip) {
      if (!zip.run) return; // the desktop core path cannot pause
      zipPausedIds.add(id);
      zip.abort.abort();
      updateProgress(id, DownloadStatus.Paused, item.progress, "Paused");
      return;
    }
    if (!sessions.has(id)) return;
    pausedIds.add(id);
    sessions.get(id)!.abort.abort();
    updateProgress(id, DownloadStatus.Paused, item.progress, "Paused");
  },

  // Resume a paused download: clear the flag, wait for the old run to fully
  // settle (its aborted fetches reject promptly), then run again, the pipeline
  // continues from the resume state on the same open disk writable.
  resumeDownload: (id, passphrase, resolvePassword) => {
    const zip = zipSessions.get(id);
    if (zip?.run && zipPausedIds.has(id)) {
      zipPausedIds.delete(id);
      zip.passphrase = passphrase;
      if (resolvePassword) zip.resolvePassword = resolvePassword;
      zip.abort = new AbortController();
      set((state) => ({
        queue: state.queue.map((i) =>
          i.id === id
            ? { ...i, status: DownloadStatus.Downloading, stage: "Resuming…", error: undefined }
            : i,
        ),
      }));
      const prior = zip.runPromise;
      relaunchAfterPrior(prior, () => {
        zip.runPromise = runBrowserZip(id);
        return zip.runPromise;
      });
      return;
    }
    const session = sessions.get(id);
    if (!session) return;
    pausedIds.delete(id);
    autoBudget.reset(id);
    session.passphrase = passphrase;
    if (resolvePassword) session.resolvePassword = resolvePassword;
    set((state) => ({
      queue: state.queue.map((i) =>
        i.id === id
          ? { ...i, status: DownloadStatus.Downloading, stage: "Resuming…", error: undefined }
          : i,
      ),
    }));
    const prior = session.runPromise;
    relaunchAfterPrior(prior, () => runSingleDownload(id));
  },

  // Auto-resume single-file downloads that died mid-transfer (tab suspended /
  // network drop). Reuses each session's OWN stored passphrase + resume state
  // (decrypted-so-far / disk high-water mark), no re-prompt. Skips ZIP
  // downloads (no resume pipeline / session gone) and permanent crypto/auth
  // failures that would only re-fail. Idempotent: sets status to "downloading"
  // synchronously, so a second call skips anything already resuming.
  autoResumeInterrupted: () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const failed = get().queue.filter((i) => i.status === DownloadStatus.Failed);
    for (const item of failed) {
      const session = sessions.get(item.id);
      if (!session) continue; // ZIP or discarded session, nothing to resume from
      if (session.transient === false) continue; // permanent. Don't loop
      if (!autoBudget.due(item.id)) continue; // backing off, or out of attempts
      autoBudget.spend(item.id);
      pausedIds.delete(item.id);
      set((state) => ({
        queue: state.queue.map((i) =>
          i.id === item.id
            ? { ...i, status: DownloadStatus.Downloading, stage: "Resuming…", error: undefined }
            : i,
        ),
      }));
      const prior = session.runPromise;
      relaunchAfterPrior(prior, () => runSingleDownload(item.id));
    }
  },

  cancelDownload: (id) => {
    // Explicit stop. Not a pause (pausedIds stays clear), so the pipeline aborts
    // the disk file and the run lands "cancelled".
    const wasPaused = pausedIds.delete(id);
    const session = sessions.get(id);
    if (session && wasPaused) {
      sessions.delete(id);
      void session.resume.saveToDisk?.abort?.().catch(() => {});
      updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
      return;
    }
    session?.abort.abort();
    const zip = zipSessions.get(id);
    if (zip && zipPausedIds.delete(id)) {
      zipSessions.delete(id);
      void zip.run?.saveToDisk?.abort?.().catch(() => {});
      zip.run?.zip.terminate();
      updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
      return;
    }
    zip?.abort.abort();
    if (!session && !zipSessions.has(id)) {
      const item = get().queue.find((i) => i.id === id);
      if (item?.status === DownloadStatus.Queued) {
        cancelledIds.add(id);
        updateProgress(id, DownloadStatus.Cancelled, undefined, "Cancelled");
      }
    }
  },

  retryDownload: (id, passphrase, resolvePassword) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;

    const session = sessions.get(id);
    if (session) {
      // Single download: continue from what's already decrypted, don't restart.
      pausedIds.delete(id);
      autoBudget.reset(id);
      session.passphrase = passphrase;
      if (resolvePassword) session.resolvePassword = resolvePassword;
      set((state) => ({
        queue: state.queue.map((i) =>
          i.id === id
            ? { ...i, status: DownloadStatus.Downloading, stage: "Retrying…", error: undefined }
            : i,
        ),
      }));
      const prior = session.runPromise;
      relaunchAfterPrior(prior, () => runSingleDownload(id));
      return;
    }

    // ZIP download (no resume pipeline): restart it fresh. A userId on the
    // session means it was desktop-originated: re-invoke the core path, not
    // the browser one.
    const zip = zipSessions.get(id);
    if (zip) {
      get().removeFromQueue(id);
      if (zip.userId) {
        get().startDesktopBulkZipDownload(
          zip.files,
          passphrase,
          zip.userId,
          resolvePassword ?? zip.resolvePassword,
        );
      } else {
        get().startBulkZipDownload(zip.files, passphrase, resolvePassword ?? zip.resolvePassword);
      }
      return;
    }

    // Fallback (session already gone): restart a plain single download.
    get().removeFromQueue(id);
    if (item.fileId === "zip") return;
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
      if (disk?.abort) {
        void disk.abort().catch(() => {});
      }
      clearTimeout(session.graceTimer);
      sessions.delete(id);
    }
    autoBudget.reset(id);
    const zip = zipSessions.get(id);
    if (zip) {
      zip.abort.abort();
      if (zipPausedIds.delete(id)) {
        void zip.run?.saveToDisk?.abort?.().catch(() => {});
        zip.run?.zip.terminate();
      }
      zipSessions.delete(id);
    }

    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }));
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter(
        (item) => item.status !== DownloadStatus.Done && item.status !== DownloadStatus.Cancelled,
      ),
    }));
  },
}));
