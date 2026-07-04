import { create } from "zustand";
import type { FileMetadata, UploadItem, UploadStatus } from "@/types";
import { toast } from "@/store/toast";
import { WorkerPool } from "@/lib/worker-pool";
import { generateSalt, deriveKeyBytes, generateCEK, wrapKey, unwrapKey, sha256File, toBase64, fromBase64 } from "@/lib/crypto";
import { initUpload, uploadChunk, completeUpload, presignChunk, directUploadToURL, confirmChunk, cancelUpload, getUploadStatus } from "@/lib/upload-session";
import { getFileMeta } from "@/lib/api";
import { setFilesData } from "@/store/files";
import { getDeviceProfile } from "@/lib/device-profile";

// --- Debounced refresh to avoid hammering the API ---
// Trailing debounce WITH a max-wait: a busy batch used to reset the timer on
// every completion, so the explorer refresh never fired until the whole batch
// quieted — files uploaded minutes ago stayed invisible. Now the refresh fires
// at most 1.5s after the last completion AND at least every 4s while
// completions keep streaming in.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRefresh: (() => void) | null = null;
let refreshFirstPendingAt: number | null = null;

function debouncedRefresh(fn?: () => void) {
  if (fn) pendingRefresh = fn;
  const now = Date.now();
  if (refreshFirstPendingAt === null) refreshFirstPendingAt = now;
  if (refreshTimer) clearTimeout(refreshTimer);
  const waited = now - refreshFirstPendingAt;
  const delay = Math.max(0, Math.min(1500, 4000 - waited));
  refreshTimer = setTimeout(() => {
    refreshFirstPendingAt = null;
    refreshTimer = null;
    const run = pendingRefresh;
    pendingRefresh = null;
    run?.();
  }, delay);
}

// --- Background push notification progress ---
// When user switches to another app/tab, show system notifications with upload progress.
// Uses the same `tag` to replace the notification (not spam new ones).
let bgNotifInterval: ReturnType<typeof setInterval> | null = null;

function startBackgroundNotifications(getBatchState: () => { done: number; failed: number; total: number; percent: number }) {
  stopBackgroundNotifications();
  bgNotifInterval = setInterval(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Only show when tab is hidden (user switched away)
    if (!document.hidden) return;

    const { done, failed, total, percent } = getBatchState();
    const active = total - done - failed;
    if (active <= 0) {
      // All done — send final notification
      const body = failed > 0
        ? `${done} uploaded, ${failed} failed`
        : `All ${done} files uploaded`;
      new Notification("Upload complete", {
        body,
        icon: "/favicon.ico",
        tag: "zcrypt-upload-progress",
        silent: true,
      });
      stopBackgroundNotifications();
      return;
    }

    // Progress bar made of block characters
    const barLen = 20;
    const filled = Math.round((percent / 100) * barLen);
    const bar = "▓".repeat(filled) + "░".repeat(barLen - filled);

    new Notification(`Uploading ${done}/${total} files`, {
      body: `${bar} ${percent}%`,
      icon: "/favicon.ico",
      tag: "zcrypt-upload-progress",
      silent: true,
      requireInteraction: false,
    });
  }, 3000);
}

function stopBackgroundNotifications() {
  if (bgNotifInterval) {
    clearInterval(bgNotifInterval);
    bgNotifInterval = null;
  }
}

// --- Throttled progress updates to prevent UI jank ---
// Batches rapid updateStatus calls into a single Zustand set() per animation frame.
const pendingUpdates = new Map<string, { status: UploadStatus; progress?: number; stage?: string; bytesProcessed?: number; totalBytes?: number; rateBps?: number }>();
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    if (pendingUpdates.size === 0) return;
    const updates = new Map(pendingUpdates);
    pendingUpdates.clear();
    useUploadStore.setState((state) => ({
      queue: state.queue.map((item) => {
        const u = updates.get(item.id);
        if (!u) return item;
        return {
          ...item,
          status: u.status,
          progress: u.progress ?? item.progress,
          stage: u.stage ?? item.stage,
          bytesProcessed: u.bytesProcessed ?? item.bytesProcessed,
          totalBytes: u.totalBytes ?? item.totalBytes,
          rateBps: u.rateBps ?? item.rateBps,
        };
      }),
    }));
  });
}

interface UploadStore {
  queue: UploadItem[];
  addToQueue: (file: File) => string;
  addBatchToQueue: (files: File[]) => { file: File; id: string }[];
  setFileId: (id: string, fileId: string) => void;
  updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string, bytesProcessed?: number, totalBytes?: number, rateBps?: number) => void;
  setError: (id: string, error: string) => void;
  removeFromQueue: (id: string) => void;         // DESTRUCTIVE: cancels the session + deletes staged data. Explicit "Cancel" only.
  dismissUpload: (id: string) => void;           // NON-destructive: clears the dock row but keeps the upload recoverable.
  clearCompleted: () => void;
  findByFileId: (fileId: string) => UploadItem | undefined;
  /** Destination folder for a queued/in-flight upload item, or null for Root.
   *  Lets the transfer manager pick the right password for resume/retry (FIX-4):
   *  a protected-folder upload must re-encrypt remaining chunks under the folder
   *  password, not the vault passphrase. */
  getItemFolderId: (id: string) => string | null;
  startUpload: (files: File[], passphrase: string, platform?: string, maxConcurrent?: number, onRefresh?: () => void, folderId?: string | null) => void;
  retryUpload: (id: string, passphrase: string) => void;
  pauseUpload: (id: string) => void;                        // aborts in-flight chunks; preserves resume context (does NOT cancel session)
  resumeUpload: (id: string, passphrase: string) => void;   // continue from getUploadStatus uploaded_chunks
  startDesktopUpload: (passphrase: string, onRefresh?: () => void) => void;
}

let counter = 0;

// Resume context for an in-flight upload. Holds the raw CEK so a retry re-encrypts
// remaining chunks with the SAME key as the chunks already uploaded — a fresh key
// would corrupt the file. Lives only in memory for the page session.
interface ResumeCtx {
  sessionId: string;
  fileId: string;
  cekBytes: ArrayBuffer;
  chunkCount: number;
  chunkSize: number; // MUST match the original — reslicing at a different size misaligns chunk boundaries
  directUpload: boolean;
  shouldCompress: boolean;
  /** The platform the session's chunks already live on. A resume MUST stay on
   *  this platform — the already-uploaded chunks are there, and silently
   *  switching (the old HF re-route bug) restarted the upload from zero. */
  platform?: string;
}

// --- Cross-session upload resume (survives a page reload) --------------------
// Only session POINTERS are persisted (never the key), keyed by file identity.
// On re-add, loadPersistedResume rebuilds the in-memory resume context by
// re-deriving the CEK from the server-stored wrapped_cek + the passphrase, so
// the raw key is never written to disk (zero-knowledge preserved).
//
// This localStorage record is now a FAST PATH only: the server also detects a
// duplicate init for a file it already has an active session for (same sha256 +
// size) and returns that session (`resumed: true`), so cross-device resumes and
// cleared-localStorage resumes work without it.
interface PersistedResume {
  sessionId: string;
  fileId: string;
  chunkCount: number;
  chunkSize: number;
  directUpload: boolean;
  shouldCompress: boolean;
  platform?: string;
}
function resumeStoreKey(file: File): string {
  return `zc_upl:${file.name}:${file.size}:${file.lastModified}`;
}
function savePersistedResume(file: File, rec: PersistedResume): void {
  try { localStorage.setItem(resumeStoreKey(file), JSON.stringify(rec)); } catch { /* quota / unavailable */ }
}
function clearPersistedResume(file: File): void {
  try { localStorage.removeItem(resumeStoreKey(file)); } catch { /* ignore */ }
}
function readPersistedResume(file: File): PersistedResume | null {
  try {
    const raw = localStorage.getItem(resumeStoreKey(file));
    return raw ? (JSON.parse(raw) as PersistedResume) : null;
  } catch { return null; }
}
/** Rebuild an in-memory resume context from a persisted record if — and only if
 *  — the server session is still active. Returns undefined on any miss (the
 *  fresh path then re-inits; the server-side duplicate-init detection gives it
 *  a second chance to resume). A fully-staged session (all chunks uploaded,
 *  complete never called) is also resumable — it skips straight to complete. */
async function loadPersistedResume(file: File, passphrase: string): Promise<ResumeCtx | undefined> {
  const rec = readPersistedResume(file);
  if (!rec) return undefined;
  try {
    const status = await getUploadStatus(rec.sessionId);
    if (status.status !== "active") return undefined;
    const meta = await getFileMeta(rec.fileId);
    if (!meta.wrapped_cek) return undefined; // legacy/no envelope — can't rebuild the key
    const kek = await deriveKeyBytes(passphrase, fromBase64(meta.salt));
    const cek = await unwrapKey(kek, fromBase64(meta.wrapped_cek));
    return {
      sessionId: rec.sessionId,
      fileId: rec.fileId,
      cekBytes: cek.buffer.slice(0) as ArrayBuffer,
      chunkCount: rec.chunkCount,
      chunkSize: rec.chunkSize,
      directUpload: rec.directUpload,
      shouldCompress: rec.shouldCompress,
      platform: rec.platform ?? status.platform,
    };
  } catch {
    return undefined; // session gone / wrong passphrase / transient → fresh init (which may still server-resume)
  }
}

// Per-item upload metadata kept out of the typed queue state: target platform,
// the file-list refresh hook, a resume context once a session exists, and the
// live-run control state (generation token, abort controller, rate tracker).
interface ItemMeta {
  platform?: string;
  onRefresh?: () => void;
  resume?: ResumeCtx;
  folderId?: string | null;
  /** Generation token for the CURRENT uploadOneFile run. Any emit/finalize from
   *  an older run (e.g. one draining after a pause) is a stale write and drops. */
  runToken?: symbol;
  /** The current run's promise — resume/retry await it so two runs never race. */
  runPromise?: Promise<void>;
  /** Aborts the current run's in-flight chunk transfers (pause/cancel). */
  abort?: AbortController;
  /** EMA byte-rate tracker for the speed/ETA display. */
  rate?: { lastBytes: number; lastTime: number; ema: number };
}
const itemMeta = new Map<string, ItemMeta>();
function patchMeta(id: string, patch: Partial<ItemMeta>): ItemMeta {
  const m = itemMeta.get(id) ?? {};
  Object.assign(m, patch);
  itemMeta.set(id, m);
  return m;
}

// Ids the user has paused. Pause now takes effect at THREE layers: the chunk
// loop stops launching, already-launched chunks check this set before touching
// the network, and the item's AbortController kills transfers already on the
// wire. The retry wrapper also checks it, so a paused chunk can't sit in a
// backoff loop. The server session + resume context stay intact for resume.
const pausedIds = new Set<string>();

/** Thrown (never retried) when a transfer stops because the user paused. */
class PausedError extends Error {
  constructor() {
    super("Upload paused");
    this.name = "PausedError";
  }
}
function isPauseError(err: unknown): boolean {
  return err instanceof PausedError || (err instanceof Error && err.message === "Upload paused");
}

// File extensions that are already compressed — skip zstd to save CPU.
const COMPRESSED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif",
  "mp4", "mkv", "avi", "mov", "webm", "flv", "m4v",
  "mp3", "aac", "ogg", "flac", "opus", "wma", "m4a",
  "zip", "rar", "7z", "gz", "bz2", "xz", "zst", "lz4", "br", "tar.gz",
  "pdf", "docx", "xlsx", "pptx", "woff", "woff2",
]);

// Retry wrapper for transient chunk-upload failures. Over a multi-GB upload
// (hundreds/thousands of chunks) a transient blip on any one chunk is likely,
// so we retry not just rate-limits but network errors, stalls, timeouts and 5xx
// — with exponential backoff + jitter. Non-transient failures (4xx: invalid,
// unauthorized, not found) throw immediately so they surface instead of looping.
// `shouldStop` (the pause check) is consulted before every attempt AND before
// every backoff sleep, so pausing can't leave a chunk retrying for minutes.
async function withRetry<T>(fn: () => Promise<T>, shouldStop?: () => boolean, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (shouldStop?.()) throw new PausedError();
    try {
      return await fn();
    } catch (err) {
      if (isPauseError(err) || shouldStop?.()) throw new PausedError();
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const transient =
        msg.includes("too many requests") || msg.includes("slow down") ||
        msg.includes("network request failed") || msg.includes("timed out") ||
        msg.includes("stalled") || msg.includes("aborted") ||
        msg.includes("temporarily") || msg.includes("unavailable") ||
        /\b5\d\d\b/.test(msg); // 5xx server errors
      if (transient && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 15_000) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

interface UploadFileOpts {
  passphrase: string;
  platform?: string;
  profile: ReturnType<typeof getDeviceProfile>;
  onRefresh?: () => void;
  /**
   * Destination folder. When set, the file is moved into this folder right after
   * its upload completes. For a password-protected folder, `passphrase` is the
   * FOLDER password (so the CEK is wrapped under the folder KEK at init time) and
   * this move just files the row under the folder. null/undefined = stay at Root.
   */
  folderId?: string | null;
  /**
   * Batch-shared KEK (startUpload derives it ONCE): PBKDF2 at 600k iterations is
   * the single most expensive CPU step of an upload, so a 50-photo batch must
   * not pay it 50 times. Sharing the PBKDF2 salt across a batch is safe —
   * security rests on the passphrase; each file still gets its own random CEK
   * and unique AES-GCM nonces. Absent on retry/resume, which derive per-file.
   */
  batchKek?: { salt: Uint8Array; kekBytes: ArrayBuffer };
  /**
   * Batch-shared WorkerPool (startUpload creates + terminates it): worker
   * spin-up and zstd WASM init cost real time on mobile, so they're paid once
   * per batch instead of once per file. Absent on retry/resume, which create
   * (and own) a transient pool per call.
   */
  pool?: WorkerPool;
}

// Runs one file through the client-side crypto + upload pipeline.
//
// If itemMeta[id] already holds a resume context (set on the first attempt once
// the session was created), it reuses that session + CEK and skips chunks the
// server already has — so a retry continues instead of restarting. Used by both
// startUpload and retryUpload. The server ALSO resumes: an init for a file with
// an active session returns that session (`resumed: true`), pinned to its
// original platform and chunk size.
async function uploadOneFile(file: File, id: string, opts: UploadFileOpts): Promise<void> {
  const { passphrase, platform, profile, onRefresh, folderId } = opts;
  const { updateStatus, setFileId, setError } = useUploadStore.getState();
  let chunkSize = profile.chunkSize;
  // Use the batch-shared pool when startUpload handed one in; otherwise
  // (retry/resume) create a transient one. We only terminate a pool we own —
  // the batch pool is torn down by startUpload once the WHOLE batch settles.
  const pool = opts.pool ?? new WorkerPool();
  const ownsPool = opts.pool === undefined;

  // Run-generation + abort wiring. Every run gets a fresh token; emits and the
  // finalize step first check they still belong to the CURRENT run, so a run
  // draining after pause/resume can't fight the new run over the same row
  // (that fight was one source of the 60→70→60 percent oscillation).
  const runToken = Symbol("uploadRun");
  const abort = new AbortController();
  patchMeta(id, { runToken, abort, rate: undefined });
  const isCurrentRun = () => itemMeta.get(id)?.runToken === runToken;
  const isPaused = () => pausedIds.has(id);
  // Early-phase pause stop (hash/derive/init — no chunk state yet). Returns
  // true when the caller should bail out of the run.
  const pauseCheckpoint = (): boolean => {
    if (!isPaused()) return false;
    if (isCurrentRun()) updateStatus(id, "paused", undefined, "Paused");
    return true;
  };

  // In-memory resume (same session) first; otherwise try a cross-session resume
  // persisted to localStorage so a partially-uploaded file continues after a
  // page reload instead of restarting from zero.
  let resume = itemMeta.get(id)?.resume;
  if (!resume) {
    resume = await loadPersistedResume(file, passphrase);
    if (resume) patchMeta(id, { resume });
  }

  try {
    if (pauseCheckpoint()) return;

    let sessionId = "";
    let cekBytes: ArrayBuffer = new ArrayBuffer(0);
    let chunkCount = 0;
    let useDirectUpload = false;
    let shouldCompress = true;
    let done = new Set<number>();
    let fileSha256 = ""; // known on the fresh path only (used for the optimistic row)
    let fileId = "";
    let wasResumed = false;

    if (!resume) {
      // FRESH: hash, derive keys, create the session.
      //
      // Envelope encryption: chunks are encrypted with a random CEK; the CEK is
      // wrapped with the passphrase-derived KEK and stored alongside the file, so
      // a file can be shared (by re-wrapping its CEK) without revealing the passphrase.
      updateStatus(id, "encrypting", 1, "Hashing file…", 0, file.size);
      fileSha256 = await sha256File(file, (hashed) => {
        // Feed hash progress into the STAGE text (the bar's byte unit stays
        // reserved for upload bytes) so a multi-GB pre-hash visibly moves.
        if (!isCurrentRun() || isPaused()) return;
        const frac = file.size > 0 ? hashed / file.size : 1;
        updateStatus(id, "encrypting", 1 + Math.round(frac * 2), `Hashing file… ${Math.round(frac * 100)}%`, 0, file.size);
      });
      if (pauseCheckpoint()) return;

      updateStatus(id, "encrypting", 2, "Deriving encryption key...");
      // Batch path: reuse the salt + KEK startUpload derived once for the whole
      // batch (see UploadFileOpts.batchKek for why sharing the salt is safe).
      // The file's stored `salt` becomes the shared batch salt. Retry/resume
      // pass no batchKek and derive per-file, exactly as before.
      const salt = opts.batchKek?.salt ?? generateSalt();
      const kekBytes = opts.batchKek?.kekBytes ?? (await deriveKeyBytes(passphrase, salt));
      const cek = generateCEK();
      const wrappedCek = await wrapKey(kekBytes, cek);
      cekBytes = cek.buffer.slice(0) as ArrayBuffer;
      if (pauseCheckpoint()) return;

      chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      shouldCompress = !COMPRESSED_EXTENSIONS.has(ext);

      updateStatus(id, "encrypting", 3, "Starting upload session...");
      // Init with a wait-for-slot retry loop. `explicitPlatform` overrides the
      // picker choice (used when a dead resumed session forces a restart — the
      // restart must stay on the ORIGINAL platform).
      const doInit = async (explicitPlatform?: string): Promise<Awaited<ReturnType<typeof initUpload>> | null> => {
        for (let attempt = 0; attempt < 60; attempt++) {
          if (isPaused()) return null;
          try {
            return await initUpload({
              filename: file.name,
              original_size: file.size,
              sha256: fileSha256,
              salt: toBase64(salt),
              wrapped_cek: toBase64(wrappedCek),
              chunk_count: chunkCount,
              chunk_size: chunkSize,
              platform: explicitPlatform ?? platform,
              // FIX-1b: create the row directly in its destination folder. For a
              // protected folder the CEK was already wrapped under the folder
              // password above, so the file is born correctly folder-keyed AND
              // folder-filed in one step — no stranding window, no post-move.
              folder_id: itemMeta.get(id)?.folderId ?? folderId ?? null,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isRetryable = msg.includes("too many concurrent") || msg.includes("too many requests") || msg.includes("slow down");
            if (isRetryable && attempt < 59) {
              updateStatus(id, "queued", 0, `Waiting for slot (${attempt + 1})...`);
              await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
              continue;
            }
            throw err;
          }
        }
        return null;
      };

      let session = await doInit();
      // doInit only ever returns null via its own pause check (retry
      // exhaustion re-throws the underlying error directly instead of
      // falling through) — so reaching here always means paused; surface
      // that status and stop rather than guarding a case that can't occur.
      if (!session) { pauseCheckpoint(); return; }

      if (session.resumed) {
        // The server found an ACTIVE session for this exact file — adopt it.
        // Our freshly-generated CEK/salt were discarded server-side; the real
        // key is the session's stored envelope, unwrapped with the passphrase.
        // Adopting also pins the ORIGINAL platform and chunk size.
        const adopted = await adoptServerSession(session, file, passphrase);
        if (adopted) {
          resume = adopted;
          patchMeta(id, { resume, platform: adopted.platform ?? itemMeta.get(id)?.platform });
          savePersistedResume(file, {
            sessionId: adopted.sessionId, fileId: adopted.fileId, chunkCount: adopted.chunkCount,
            chunkSize: adopted.chunkSize, directUpload: adopted.directUpload,
            shouldCompress: adopted.shouldCompress, platform: adopted.platform,
          });
        } else {
          // Can't continue the old session (its envelope won't unwrap with this
          // passphrase, or its chunk size is unknown). Discard it and restart —
          // ON ITS PLATFORM, never a silently different one.
          toast.warning(`Couldn't continue the previous upload of "${file.name}" — restarting on ${session.platform}.`);
          await cancelUpload(session.session_id).catch(() => { /* best-effort */ });
          clearPersistedResume(file);
          session = await doInit(session.platform);
          if (!session) { pauseCheckpoint(); return; } // same reasoning as the fresh-path check above
        }
      }

      if (!resume) {
        // Genuinely fresh session.
        sessionId = session.session_id;
        useDirectUpload = session.direct_upload;
        fileId = session.file_id;
        setFileId(id, fileId);
        // The server's returned platform is the session's REAL home (it applies
        // the default when the picker was on Auto) — remember it so any retry
        // or resume of this item stays there.
        patchMeta(id, { platform: session.platform || itemMeta.get(id)?.platform });

        // Persist the resume context NOW so a mid-upload failure can continue.
        const ctx: ResumeCtx = { sessionId, fileId, cekBytes, chunkCount, chunkSize, directUpload: useDirectUpload, shouldCompress, platform: session.platform };
        patchMeta(id, { resume: ctx });
        // Also persist session pointers (NOT the key) so this upload can resume
        // after a page reload — see loadPersistedResume.
        savePersistedResume(file, { sessionId, fileId, chunkCount, chunkSize, directUpload: useDirectUpload, shouldCompress, platform: session.platform });
      }
    }

    if (resume) {
      // RESUME (in-memory ctx, localStorage ctx, or a server-adopted session):
      // reuse the existing session + CEK; skip chunks already uploaded. The
      // ctx's platform pins any future retry to the session's real home.
      wasResumed = true;
      sessionId = resume.sessionId;
      cekBytes = resume.cekBytes;
      chunkCount = resume.chunkCount;
      chunkSize = resume.chunkSize;
      useDirectUpload = resume.directUpload;
      shouldCompress = resume.shouldCompress;
      fileId = resume.fileId;
      if (resume.platform) patchMeta(id, { platform: resume.platform });
      setFileId(id, fileId);
      try {
        const status = await getUploadStatus(sessionId);
        done = new Set(status.uploaded_chunks);
      } catch {
        done = new Set(); // status unavailable — re-send all (chunks are idempotent by SHA)
      }
    }

    // Chunk pipeline — TWO-STAGE BACKPRESSURE:
    //   RELAY:  [worker] -> [upload to server] -> [server relays to platform]
    //   DIRECT: [worker] -> [presign] -> [upload directly to platform] -> [confirm]
    // Direct (HuggingFace LFS) sends data once; relay (GitHub/GitLab/Telegram) twice.
    let uploadedChunks = done.size;
    let totalEncryptedSize = 0;
    let totalCompressedSize = 0;

    // Byte-level progress: completed chunks count their full plaintext size;
    // in-flight chunks (fed by xhr.upload.onprogress) contribute their sent
    // bytes at 90% weight — sent-to-server is real work (relay PUTs stage to
    // disk on receipt) but not yet confirmed, so it's slightly discounted. The
    // emitted value is MONOTONIC per run: a retried/aborted chunk can shrink
    // the underlying sum, but the displayed number never goes backwards.
    const plainSizeOfChunk = (i: number) => Math.min(chunkSize, file.size - i * chunkSize);
    let completedPlainBytes = 0;
    for (const i of done) completedPlainBytes += plainSizeOfChunk(i);
    const inFlightPlainBytes = new Map<number, number>();
    const IN_FLIGHT_WEIGHT = 0.9;
    // On resume, floor the display at what the row already showed so the bar
    // never jumps backwards when a resume re-derives the byte count.
    const prevShown = useUploadStore.getState().queue.find((i) => i.id === id)?.bytesProcessed ?? 0;
    let lastEmittedBytes = wasResumed ? Math.min(prevShown, file.size) : 0;
    let lastEmittedPercent = 0;

    const emitByteProgress = () => {
      // Stale-run emits and paused emits both drop: while paused, an in-flight
      // chunk settling must not flip the row back to "uploading".
      if (!isCurrentRun() || isPaused()) return;
      let inFlight = 0;
      for (const v of inFlightPlainBytes.values()) inFlight += v;
      let bytes = Math.min(completedPlainBytes + IN_FLIGHT_WEIGHT * inFlight, file.size);
      bytes = Math.max(bytes, lastEmittedBytes);
      lastEmittedBytes = bytes;
      const fraction = file.size > 0 ? bytes / file.size : uploadedChunks / chunkCount;
      let percent = 3 + Math.round(fraction * 92);
      percent = Math.max(percent, lastEmittedPercent);
      lastEmittedPercent = percent;

      // EMA byte rate for the speed + ETA display (sampled at most ~1/s).
      const meta = itemMeta.get(id);
      let rateBps: number | undefined;
      if (meta) {
        const now = Date.now();
        if (!meta.rate) {
          meta.rate = { lastBytes: bytes, lastTime: now, ema: 0 };
        } else {
          const dtSec = (now - meta.rate.lastTime) / 1000;
          if (dtSec >= 1) {
            const inst = Math.max(0, bytes - meta.rate.lastBytes) / dtSec;
            meta.rate.ema = meta.rate.ema === 0 ? inst : meta.rate.ema * 0.7 + inst * 0.3;
            meta.rate.lastBytes = bytes;
            meta.rate.lastTime = now;
          }
          rateBps = meta.rate.ema > 0 ? meta.rate.ema : undefined;
        }
      }

      // Stage names the chunk currently in flight (falls back to the completed
      // count between chunks / at the end).
      const current = Math.min(uploadedChunks + (inFlightPlainBytes.size > 0 ? 1 : 0), chunkCount);
      updateStatus(id, "uploading", percent, `Uploading chunk ${current}/${chunkCount}`, bytes, file.size, rateBps);
    };

    // Emit the TRUE resume position immediately (before any chunk moves), so a
    // resume never dips the row to 3%/empty while the first chunk spins up.
    if (wasResumed) emitByteProgress();

    // Emits "paused" with the run's real byte position. No-op if a resume was
    // already requested (pausedIds cleared) — the next run owns the row then.
    const markPaused = () => {
      if (!isCurrentRun() || !isPaused()) return;
      const percent = 3 + Math.round((file.size > 0 ? completedPlainBytes / file.size : uploadedChunks / chunkCount) * 92);
      updateStatus(id, "paused", percent, "Paused", completedPlainBytes, file.size);
    };

    // Pipeline depth: let workers pre-process several chunks ahead of uploads.
    const pipelineDepth = Math.min(profile.workers * 3, 12);
    let pipelineSlots = 0;
    const pipelineWaiters: (() => void)[] = [];
    const acquirePipelineSlot = (): Promise<void> => {
      if (pipelineSlots < pipelineDepth) { pipelineSlots++; return Promise.resolve(); }
      return new Promise<void>((resolve) => pipelineWaiters.push(resolve));
    };
    const releasePipelineSlot = () => {
      pipelineSlots--;
      const next = pipelineWaiters.shift();
      if (next) { pipelineSlots++; next(); }
    };

    // Upload concurrency: limit simultaneous network uploads.
    const maxUploads = useDirectUpload ? 6 : 5;
    let activeUploads = 0;
    const uploadWaiters: (() => void)[] = [];
    const acquireUploadSlot = (): Promise<void> => {
      if (activeUploads < maxUploads) { activeUploads++; return Promise.resolve(); }
      return new Promise<void>((resolve) => uploadWaiters.push(resolve));
    };
    const releaseUploadSlot = () => {
      activeUploads--;
      const next = uploadWaiters.shift();
      if (next) { activeUploads++; next(); }
    };

    const chunkPromises: Promise<void>[] = [];
    let firstError: Error | null = null;
    const shouldStop = () => isPaused() || abort.signal.aborted;

    for (let i = 0; i < chunkCount; i++) {
      if (firstError) break;
      // Pause boundary 1: stop launching new chunks.
      if (isPaused()) break;
      if (done.has(i)) continue; // resume: server already has this chunk

      // Backpressure: don't read ahead more than pipelineDepth chunks
      await acquirePipelineSlot();

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkData = await file.slice(start, end).arrayBuffer();

      // Send to worker for compress -> encrypt -> hash
      const chunkPromise = pool.process({
        chunkIndex: i,
        plaintext: chunkData, // transferred to worker (zero-copy)
        keyBytes: cekBytes.slice(0), // CEK — copy since buffer gets neutered on transfer
        compress: shouldCompress,
        compressionLevel: profile.compressionLevel,
      }).then(async (result) => {
        // Pause boundary 2: a chunk that finished encrypting while paused must
        // not touch the network. It stays out of `done`, so resume re-encrypts
        // and sends it then.
        if (shouldStop()) return;
        // Wait for upload slot (limits concurrent network requests)
        await acquireUploadSlot();

        try {
          if (shouldStop()) return; // paused while waiting for a slot
          const encrypted = new Uint8Array(result.encrypted);

          // Intra-chunk progress: scale WIRE bytes sent to PLAINTEXT bytes (the
          // bar's unit) via the chunk's encrypted/plaintext ratio, then feed the
          // shared byte accounting. emitByteProgress skips emits while paused.
          const onChunkProgress = (sentBytes: number) => {
            const frac = encrypted.byteLength > 0 ? Math.min(sentBytes / encrypted.byteLength, 1) : 1;
            const prev = inFlightPlainBytes.get(result.chunkIndex) ?? 0;
            inFlightPlainBytes.set(result.chunkIndex, Math.max(prev, frac * plainSizeOfChunk(result.chunkIndex)));
            emitByteProgress();
          };

          if (useDirectUpload) {
            // DIRECT MODE: presign -> upload to platform -> confirm
            const presign = await withRetry(() => presignChunk(
              sessionId, result.chunkIndex, result.sha256, encrypted.byteLength
            ), shouldStop);
            if (!presign.already_exists) {
              await directUploadToURL(presign.upload_url, presign.upload_headers, encrypted, onChunkProgress, abort.signal);
            }
            await withRetry(() => confirmChunk(
              sessionId, result.chunkIndex, result.sha256, encrypted.byteLength, presign.remote_path, result.compressed
            ), shouldStop);
          } else {
            // RELAY MODE: upload to server (server relays to platform)
            await withRetry(() => uploadChunk(
              sessionId, result.chunkIndex, encrypted, result.sha256, result.compressed, onChunkProgress, abort.signal
            ), shouldStop);
          }

          uploadedChunks++;
          totalEncryptedSize += result.encryptedSize;
          totalCompressedSize += result.compressed ? result.compressedSize : result.originalSize;

          // Move this chunk from in-flight to completed, then emit. The byte
          // accounting runs even while paused (so resume math stays correct);
          // emitByteProgress itself skips the status emit while paused so an
          // in-flight chunk finishing can't flip the row back to "uploading".
          inFlightPlainBytes.delete(result.chunkIndex);
          completedPlainBytes += plainSizeOfChunk(result.chunkIndex);
          emitByteProgress();
        } finally {
          releaseUploadSlot();
        }
      }).finally(releasePipelineSlot).catch((err) => {
        // A pause-triggered abort is a stop, not a failure — swallow it here so
        // the finalize guard (uploadedChunks < chunkCount) handles the pause.
        if (isPauseError(err)) {
          inFlightPlainBytes.clear();
          return;
        }
        if (!firstError) firstError = err instanceof Error ? err : new Error(String(err));
      });

      chunkPromises.push(chunkPromise);
    }

    await Promise.all(chunkPromises);
    // firstError can never be pause-classified: the chunk .catch() above
    // already intercepts and swallows isPauseError(err) before it would ever
    // be assigned here (see the comment at that catch) — the finalize guard
    // below (uploadedChunks < chunkCount) is what actually handles a pause.
    if (firstError) throw firstError;

    // Finalize guard: NEVER complete a session that doesn't have every chunk.
    // The loop can only end short of chunkCount because of a pause (errors
    // throw above), and completing a partial session used to make the backend
    // 400 and flash the row "failed" if resume raced the drain.
    if (uploadedChunks < chunkCount) {
      markPaused();
      return;
    }
    if (isPaused()) {
      // All chunks landed but the user paused before finalize — hold there so
      // the file never appears in the vault while "paused". Resume completes it.
      markPaused();
      return;
    }
    if (!isCurrentRun()) return; // a newer run owns this item — let it finalize

    // Finalize
    updateStatus(id, "uploading", 97, "Finalizing...");
    await withRetry(() => completeUpload(sessionId, totalEncryptedSize, totalCompressedSize));

    // FIX-1b: no post-complete moveFile. The file was created in its destination
    // folder atomically at init (initUpload's folder_id), so it is already filed
    // in the right folder AND keyed correctly — there is no stranding window.

    updateStatus(id, "done", 100, "Done");
    patchMeta(id, { resume: undefined }); // complete — nothing to resume
    clearPersistedResume(file); // drop the cross-session resume record

    // Optimistic completion: materialize the row in the explorer immediately
    // (the debounced refetch reconciles). Fresh uploads only — a resumed run's
    // size bookkeeping covers only the chunks IT sent, so its row would carry
    // wrong compressed/encrypted sizes; the refresh covers it instead.
    if (!wasResumed && fileSha256) {
      setFilesData((prev) => prev.some((f) => f.id === fileId)
        ? prev
        : [{
            id: fileId,
            original_name: file.name,
            original_size: file.size,
            compressed_size: totalCompressedSize,
            encrypted_size: totalEncryptedSize,
            chunk_count: chunkCount,
            sha256: fileSha256,
            created_at: new Date().toISOString(),
            folder_id: itemMeta.get(id)?.folderId ?? folderId ?? null,
          } satisfies FileMetadata, ...prev]);
    }
    debouncedRefresh(onRefresh);
  } catch (err) {
    if (isPauseError(err)) {
      // Paused mid-run (e.g. during init/backoff) — this is a stop, not a failure.
      if (isCurrentRun() && isPaused()) updateStatus(id, "paused", undefined, "Paused");
      return;
    }
    const msg = err instanceof Error ? err.message : "Upload failed";
    const friendlyMsg = msg.includes("storage not available")
      ? "No storage platform connected. Go to Settings to connect one."
      : msg;
    if (isCurrentRun()) setError(id, friendlyMsg);
    // Deliberately do NOT cancel the session here — keeping it lets the user
    // resume via Retry (skipping chunks already uploaded). The session is
    // cancelled only when the user dismisses the item (removeFromQueue).
  } finally {
    // Batch-shared pools outlive this file — startUpload terminates them once
    // the whole batch settles. Only tear down a pool this call created.
    if (ownsPool) pool.terminate();
  }
}

/** Adopt a server-resumed session: unwrap ITS stored envelope (our fresh CEK is
 *  irrelevant — the staged chunks were encrypted with the original key) and
 *  take its chunk size / platform. Returns undefined when the envelope won't
 *  unwrap with this passphrase or the chunk size is unrecoverable (pre-upgrade
 *  sessions) — the caller then restarts on the session's platform. */
async function adoptServerSession(
  session: { session_id: string; file_id: string; platform: string; direct_upload: boolean; chunk_size?: number; chunk_count?: number },
  file: File,
  passphrase: string
): Promise<ResumeCtx | undefined> {
  try {
    const meta = await getFileMeta(session.file_id);
    if (!meta.wrapped_cek) return undefined;
    const kek = await deriveKeyBytes(passphrase, fromBase64(meta.salt));
    const cek = await unwrapKey(kek, fromBase64(meta.wrapped_cek));
    const rec = readPersistedResume(file);
    const chunkSize = session.chunk_size || rec?.chunkSize || 0;
    const chunkCount = session.chunk_count || rec?.chunkCount || 0;
    if (!chunkSize || !chunkCount) return undefined; // can't reslice at unknown boundaries
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    return {
      sessionId: session.session_id,
      fileId: session.file_id,
      cekBytes: cek.buffer.slice(0) as ArrayBuffer,
      chunkCount,
      chunkSize,
      directUpload: session.direct_upload,
      shouldCompress: rec?.shouldCompress ?? !COMPRESSED_EXTENSIONS.has(ext),
      platform: session.platform,
    };
  } catch {
    return undefined; // wrong passphrase for the original envelope / transient
  }
}

// Launch a run and record its promise so resume/retry can await the previous
// run before starting a new one (prevents two runs racing over one item).
function launchRun(file: File, id: string, opts: UploadFileOpts): Promise<void> {
  const p = uploadOneFile(file, id, opts);
  const m = itemMeta.get(id);
  if (m) m.runPromise = p;
  return p;
}

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

  addBatchToQueue: (files: File[]) => {
    const now = Date.now();
    const items = files.map((file) => ({
      file,
      id: `upload_${++counter}_${now}`,
    }));
    set((state) => ({
      queue: [
        ...state.queue,
        ...items.map(({ id, file }) => ({
          id,
          file,
          status: "queued" as const,
          progress: 0,
          stage: "Queued",
          startedAt: now,
        })),
      ],
    }));
    return items;
  },

  setFileId: (id, fileId) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, fileId } : item
      ),
    }));
  },

  updateStatus: (id, status, progress, stage, bytesProcessed, totalBytes, rateBps) => {
    // A paused item accepts only pause/terminal writes. Anything else — a
    // straggling in-flight emit, an SSE event from the backend — must not flip
    // it back to "uploading" (that was how pause visibly undid itself).
    if (pausedIds.has(id) && status !== "paused" && status !== "failed" && status !== "done") return;
    // Terminal states flush immediately so UI reflects completion/failure.
    // "paused" is not terminal, but we flush it immediately too (and drop any
    // pending batched update for this id) so a stale in-flight progress frame
    // can't overwrite the paused state a frame later.
    if (status === "done" || status === "failed" || status === "paused") {
      pendingUpdates.delete(id);
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? { ...item, status, progress: progress ?? item.progress, stage: stage ?? item.stage, bytesProcessed: bytesProcessed ?? item.bytesProcessed, totalBytes: totalBytes ?? item.totalBytes, rateBps: undefined }
            : item
        ),
      }));
      return;
    }
    // Batch intermediate progress — one render per frame
    pendingUpdates.set(id, { status, progress, stage, bytesProcessed, totalBytes, rateBps });
    scheduleFlush();
  },

  setError: (id, error) => {
    // Sets "failed" directly, bypassing updateStatus's throttle — so it must
    // also purge any still-queued progress write for this id, the same way
    // updateStatus's own terminal branch does. Otherwise a requestAnimationFrame
    // flush already scheduled from the last progress tick lands AFTER this and
    // stomps "failed" back to whatever intermediate status/stage it was queued
    // with, silently un-failing a row that actually stopped.
    pendingUpdates.delete(id);
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: "failed" as const, error } : item
      ),
    }));
  },

  removeFromQueue: (id) => {
    // DESTRUCTIVE — the explicit "Cancel/Discard" path. Aborts any in-flight
    // chunks, cancels the session server-side (deletes staged data) and drops
    // the resume record, so the upload is intentionally, permanently gone. Must
    // ONLY be reached from an explicit Cancel button — never from swipe/dismiss
    // (that's dismissUpload).
    const meta = itemMeta.get(id);
    meta?.abort?.abort();
    if (meta?.resume?.sessionId) {
      cancelUpload(meta.resume.sessionId).catch(() => {});
    }
    const item = get().queue.find((i) => i.id === id);
    if (item) clearPersistedResume(item.file);
    itemMeta.delete(id);
    pausedIds.delete(id);
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== id),
    }));
  },

  dismissUpload: (id) => {
    // NON-destructive — just clears the row from the transfer dock. Stops the
    // local run (no point uploading into a row that no longer exists) but
    // leaves the server session ALIVE and keeps the resume record, so an
    // interrupted or failed upload stays recoverable in the unfinished-uploads
    // section (and re-adding the same file resumes). This is what swipe / the
    // dock ✕ do now, so a stray swipe can never destroy a 90%-done upload again.
    itemMeta.get(id)?.abort?.abort();
    itemMeta.delete(id);
    pausedIds.delete(id);
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

  getItemFolderId: (id) => itemMeta.get(id)?.folderId ?? null,

  startUpload: (files, passphrase, platform, maxConcurrent, onRefresh, folderId = null) => {
    const { addBatchToQueue } = get();
    const profile = getDeviceProfile();

    // Effective file-level concurrency. Mobile profiles allow only 1-2 parallel
    // files, so a 50-photo batch ran as ~25-50 sequential rounds, each paying
    // fixed per-file costs (3 serial init/complete RTTs). When EVERY file is
    // small (under 2 chunks), floor the concurrency at 4 — the heavy per-file
    // work is batch-amortized (shared KEK + worker pool below), so the extra
    // parallelism costs little more than network sockets. Mixed or large
    // batches keep the profile/plan limit so big files don't compete for memory
    // and bandwidth. (Deliberately the simple "all-small" rule — no median-size
    // heuristics.) If the raised floor trips the server's concurrent-upload
    // cap, initUpload's wait-for-slot retry loop absorbs it.
    const baseLimit = maxConcurrent ?? profile.maxConcurrentUploads;
    const allSmall = files.length > 0 && files.every((f) => f.size < 2 * profile.chunkSize);
    const effectiveConcurrent = allSmall ? Math.max(baseLimit, 4) : baseLimit;

    // Add all files to queue in a single state update (prevents 10k re-renders)
    const items = addBatchToQueue(files);
    // The platform is the USER'S pick (or undefined = Auto, which the server
    // resolves — Telegram first). There is deliberately no size-based re-route
    // any more: the old "large files → HuggingFace" nudge silently overrode the
    // picker, capped big files to HF's small real quota, and broke resume by
    // switching platforms. `folderId` is the destination folder (the current
    // explorer folder); for a protected folder `passphrase` is the folder password.
    for (const it of items) {
      itemMeta.set(it.id, { platform, onRefresh, folderId });
    }

    // Semaphore-based concurrency limiter
    let running = 0;
    const waiting: (() => void)[] = [];
    const acquire = async () => {
      if (running < effectiveConcurrent) { running++; return; }
      await new Promise<void>((resolve) => waiting.push(resolve));
    };
    const release = () => {
      running--;
      const next = waiting.shift();
      if (next) { running++; next(); }
    };

    // Start background push notifications for when user switches away
    const batchIds = new Set(items.map((i) => i.id));
    startBackgroundNotifications(() => {
      const { queue } = get();
      const batch = queue.filter((q) => batchIds.has(q.id));
      const done = batch.filter((i) => i.status === "done").length;
      const failed = batch.filter((i) => i.status === "failed").length;
      const percent = batch.length > 0
        ? Math.round(batch.reduce((sum, i) => sum + (i.status === "done" ? 100 : i.status === "failed" ? 100 : (i.progress || 0)), 0) / batch.length)
        : 0;
      return { done, failed, total: batch.length, percent };
    });

    // Launch all uploads with concurrency control, show summary when done.
    // BATCH AMORTIZATION: derive ONE KEK (PBKDF2 600k iterations — the single
    // most expensive CPU step) and spin up ONE worker pool (workers + zstd WASM
    // init) for the whole batch, instead of once per file. Both are shared by
    // every uploadOneFile call and torn down when the batch settles — the
    // finally runs even if setup or an upload throws. uploadOneFile catches its
    // own per-file errors (setError), so Promise.all settles when all files do.
    void (async () => {
      const pool = new WorkerPool();
      try {
        const batchSalt = generateSalt();
        const batchKek = { salt: batchSalt, kekBytes: await deriveKeyBytes(passphrase, batchSalt) };
        await Promise.all(
          items.map(async ({ file, id }) => {
            await acquire();
            try {
              const meta = itemMeta.get(id);
              await launchRun(file, id, { passphrase, platform: meta?.platform, profile, onRefresh, folderId: meta?.folderId, batchKek, pool });
            } finally {
              release();
            }
          })
        );
      } finally {
        pool.terminate();
        stopBackgroundNotifications();
      }

      // Batch complete — show a single summary toast
      const { queue } = get();
      const batchItems = queue.filter((q) => batchIds.has(q.id));
      const doneCount = batchItems.filter((i) => i.status === "done").length;
      const failedCount = batchItems.filter((i) => i.status === "failed").length;
      const pausedCount = batchItems.filter((i) => i.status === "paused").length;
      const total = batchItems.length;

      // If any item is paused, the batch isn't truly finished — suppress the
      // summary toast. Resuming re-runs uploadOneFile (via resumeUpload), and the
      // user will see the per-item completion in the transfer manager.
      if (pausedCount === 0) {
        if (total === 1) {
          if (doneCount === 1) toast.success(`${items[0].file.name} uploaded`);
          else if (failedCount === 1) toast.error(`${items[0].file.name} failed`);
        } else if (failedCount === 0) {
          toast.success(`All ${doneCount} files uploaded`);
        } else if (doneCount === 0) {
          toast.error(`All ${failedCount} files failed to upload`);
        } else {
          toast.warning(`${doneCount} uploaded, ${failedCount} failed`);
        }
      }

      onRefresh?.();
    })();
  },

  retryUpload: (id, passphrase) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;
    const meta = itemMeta.get(id);
    // Reset the existing item in place (keeps its id, so its resume context in
    // itemMeta still applies and the upload continues from where it failed).
    // Progress/bytes are KEPT — a retry continues, so the bar must not snap to 0.
    set((state) => ({
      queue: state.queue.map((i) =>
        i.id === id ? { ...i, status: "queued" as const, error: undefined, stage: "Retrying..." } : i
      ),
    }));
    const prior = meta?.runPromise;
    void (async () => {
      // Never race a still-draining previous run over the same item.
      try { await prior; } catch { /* previous run settled with an error — fine */ }
      await launchRun(item.file, id, {
        passphrase,
        platform: meta?.resume?.platform ?? meta?.platform,
        profile: getDeviceProfile(),
        onRefresh: meta?.onRefresh,
        folderId: meta?.folderId,
      });
    })();
  },

  // Pause an in-progress upload. Three-layer stop: (1) the chunk loop stops
  // launching, (2) chunks that already left the worker check pausedIds before
  // touching the network, (3) the run's AbortController kills transfers already
  // on the wire (the upload-session wrappers take an AbortSignal now). The
  // server session + resume context (CEK, sessionId) stay untouched, so
  // resumeUpload continues from the server's uploaded_chunks. We do NOT call
  // cancelUpload — that's the "give up" path (removeFromQueue).
  pauseUpload: (id) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;
    // Only meaningful while queued/encrypting/uploading; ignore terminal states.
    if (item.status === "done" || item.status === "failed" || item.status === "paused") return;
    pausedIds.add(id);
    itemMeta.get(id)?.abort?.abort();
    get().updateStatus(id, "paused", item.progress, "Paused", item.bytesProcessed, item.totalBytes);
  },

  // Resume a paused upload. Clears the paused flag, waits for the previous run
  // to fully settle (its aborted chunks reject quickly), then re-runs
  // uploadOneFile — which reads itemMeta[id].resume and continues from
  // getUploadStatus's uploaded_chunks on the ORIGINAL platform, re-encrypting
  // only the remaining chunks with the SAME CEK.
  resumeUpload: (id, passphrase) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;
    pausedIds.delete(id);
    const meta = itemMeta.get(id);
    set((state) => ({
      queue: state.queue.map((i) =>
        i.id === id ? { ...i, status: "uploading" as const, error: undefined, stage: "Resuming…" } : i
      ),
    }));
    const prior = meta?.runPromise;
    void (async () => {
      try { await prior; } catch { /* previous run settled with an error — fine */ }
      await launchRun(item.file, id, {
        passphrase,
        platform: meta?.resume?.platform ?? meta?.platform,
        profile: getDeviceProfile(),
        onRefresh: meta?.onRefresh,
        folderId: meta?.folderId,
      });
    })();
  },

  // Desktop-only: opens native file picker, encrypts locally via sidecar.
  // No browser File objects, no IPC data transfer — sidecar reads from disk path.
  startDesktopUpload: async (passphrase, onRefresh) => {
    const { addToQueue, updateStatus, setError } = get();

    const { pickFiles: tauriPickFiles, localUpload: tauriLocalUpload } = await import("@/lib/tauri");
    const paths = await tauriPickFiles({ multiple: true, title: "Select files to upload" });
    if (!paths.length) return;

    for (const filePath of paths) {
      const fileName = filePath.split("/").pop() ?? filePath;
      // Create a minimal File object for the queue UI
      const dummyFile = new File([], fileName);
      const id = addToQueue(dummyFile);

      try {
        updateStatus(id, "encrypting", 10, "Encrypting locally...");
        await tauriLocalUpload(filePath, passphrase);
        updateStatus(id, "done", 100, "Done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setError(id, msg);
      }
    }

    onRefresh?.();
  },
}));
