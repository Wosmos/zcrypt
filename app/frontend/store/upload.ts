import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";
import { toast } from "@/store/toast";
import { WorkerPool } from "@/lib/worker-pool";
import { generateSalt, deriveKeyBytes, generateCEK, wrapKey, unwrapKey, sha256File, toBase64, fromBase64 } from "@/lib/crypto";
import { initUpload, uploadChunk, completeUpload, presignChunk, directUploadToURL, confirmChunk, cancelUpload, getUploadStatus } from "@/lib/upload-session";
import { getFileMeta } from "@/lib/api";
import { getDeviceProfile } from "@/lib/device-profile";

// --- Debounced refresh to avoid hammering the API ---
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRefresh: (() => void) | null = null;

function debouncedRefresh(fn?: () => void) {
  if (fn) pendingRefresh = fn;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    pendingRefresh?.();
    refreshTimer = null;
  }, 1500);
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
const pendingUpdates = new Map<string, { status: UploadStatus; progress?: number; stage?: string; bytesProcessed?: number; totalBytes?: number }>();
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
  updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string, bytesProcessed?: number, totalBytes?: number) => void;
  setError: (id: string, error: string) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
  findByFileId: (fileId: string) => UploadItem | undefined;
  /** Destination folder for a queued/in-flight upload item, or null for Root.
   *  Lets the transfer manager pick the right password for resume/retry (FIX-4):
   *  a protected-folder upload must re-encrypt remaining chunks under the folder
   *  password, not the vault passphrase. */
  getItemFolderId: (id: string) => string | null;
  startUpload: (files: File[], passphrase: string, platform?: string, maxConcurrent?: number, onRefresh?: () => void, hfConnected?: boolean, folderId?: string | null) => void;
  retryUpload: (id: string, passphrase: string) => void;
  pauseUpload: (id: string) => void;                        // stop at chunk boundary; preserves resume context (does NOT cancel session)
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
}

// --- Cross-session upload resume (survives a page reload) --------------------
// Only session POINTERS are persisted (never the key), keyed by file identity.
// On re-add, loadPersistedResume rebuilds the in-memory resume context by
// re-deriving the CEK from the server-stored wrapped_cek + the passphrase, so
// the raw key is never written to disk (zero-knowledge preserved).
interface PersistedResume {
  sessionId: string;
  fileId: string;
  chunkCount: number;
  chunkSize: number;
  directUpload: boolean;
  shouldCompress: boolean;
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
/** Rebuild an in-memory resume context from a persisted record if — and only if
 *  — the server session is still active and partially complete. Returns
 *  undefined on any miss (the fresh path then re-inits and overwrites it). */
async function loadPersistedResume(file: File, passphrase: string): Promise<ResumeCtx | undefined> {
  let rec: PersistedResume;
  try {
    const raw = localStorage.getItem(resumeStoreKey(file));
    if (!raw) return undefined;
    rec = JSON.parse(raw) as PersistedResume;
  } catch { return undefined; }
  try {
    const status = await getUploadStatus(rec.sessionId);
    const uploaded = status.uploaded_chunks?.length ?? 0;
    if (status.status !== "active" || uploaded === 0 || uploaded >= rec.chunkCount) return undefined;
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
    };
  } catch {
    return undefined; // session gone / wrong passphrase / transient → fresh upload
  }
}

// Per-item upload metadata kept out of the typed queue state: target platform,
// the file-list refresh hook, and (once a session exists) a resume context so a
// failed item can continue instead of restarting from zero.
const itemMeta = new Map<string, { platform?: string; onRefresh?: () => void; resume?: ResumeCtx; routedToHF?: boolean; folderId?: string | null }>();

// Ids the user has paused. The chunk loop in uploadOneFile checks this set at the
// chunk boundary (before launching the next chunk) and stops cleanly, leaving the
// server session + resume context intact so resumeUpload can continue from
// getUploadStatus's uploaded_chunks. We CANNOT abort an in-flight chunk: none of
// the lib/upload-session.ts wrappers accept an AbortSignal (see contract §3), so
// in-flight chunks finish and pause takes effect at the next chunk boundary.
const pausedIds = new Set<string>();

// Files at/above this size prefer HuggingFace when connected: only HF supports
// direct (presigned) upload that bypasses the Railway relay. GitHub/GitLab/Telegram
// relay every byte through a memory-bound free-tier backend.
const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB

// Resolve the platform a file should upload to, applying the large-file -> HF nudge.
// Only overrides when the user left the picker on "Auto" (platform undefined); a
// manual pick always wins.
function resolveUploadPlatform(
  fileSize: number,
  chosenPlatform: string | undefined,
  hfConnected: boolean
): { platform: string | undefined; routedToHF: boolean } {
  if (!chosenPlatform && hfConnected && fileSize >= LARGE_FILE_THRESHOLD) {
    return { platform: "huggingface", routedToHF: true };
  }
  return { platform: chosenPlatform, routedToHF: false };
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
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
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
// startUpload and retryUpload.
async function uploadOneFile(file: File, id: string, opts: UploadFileOpts): Promise<void> {
  const { passphrase, platform, profile, onRefresh, folderId } = opts;
  const { updateStatus, setFileId, setError } = useUploadStore.getState();
  let chunkSize = profile.chunkSize;
  // Use the batch-shared pool when startUpload handed one in; otherwise
  // (retry/resume) create a transient one. We only terminate a pool we own —
  // the batch pool is torn down by startUpload once the WHOLE batch settles.
  const pool = opts.pool ?? new WorkerPool();
  const ownsPool = opts.pool === undefined;

  // In-memory resume (same session) first; otherwise try a cross-session resume
  // persisted to localStorage so a partially-uploaded file continues after a
  // page reload instead of restarting from zero.
  let resume = itemMeta.get(id)?.resume;
  if (!resume) {
    resume = await loadPersistedResume(file, passphrase);
    if (resume) itemMeta.set(id, { ...itemMeta.get(id), resume });
  }
  // A resumed upload MUST reslice at the original chunk size or the byte ranges
  // won't line up with the chunks the server already has.
  if (resume) chunkSize = resume.chunkSize;

  try {
    let sessionId: string;
    let cekBytes: ArrayBuffer;
    let chunkCount: number;
    let useDirectUpload: boolean;
    let shouldCompress: boolean;
    let done: Set<number>;

    if (resume) {
      // RESUME: reuse the existing session + CEK; skip chunks already uploaded.
      sessionId = resume.sessionId;
      cekBytes = resume.cekBytes;
      chunkCount = resume.chunkCount;
      useDirectUpload = resume.directUpload;
      shouldCompress = resume.shouldCompress;
      setFileId(id, resume.fileId);
      updateStatus(id, "uploading", 3, "Resuming…", 0, file.size);
      try {
        const status = await getUploadStatus(sessionId);
        done = new Set(status.uploaded_chunks);
      } catch {
        done = new Set(); // status unavailable — re-send all (chunks are idempotent by SHA)
      }
    } else {
      // FRESH: hash, derive keys, create the session.
      //
      // Envelope encryption: chunks are encrypted with a random CEK; the CEK is
      // wrapped with the passphrase-derived KEK and stored alongside the file, so
      // a file can be shared (by re-wrapping its CEK) without revealing the passphrase.
      const routedToHF = itemMeta.get(id)?.routedToHF;
      updateStatus(id, "encrypting", 1, routedToHF ? "Hashing — large file, using HuggingFace direct" : "Hashing file...", 0, file.size);
      const fileSha256 = await sha256File(file);

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

      chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      shouldCompress = !COMPRESSED_EXTENSIONS.has(ext);

      updateStatus(id, "encrypting", 3, "Starting upload session...");
      let session: Awaited<ReturnType<typeof initUpload>> | null = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          session = await initUpload({
            filename: file.name,
            original_size: file.size,
            sha256: fileSha256,
            salt: toBase64(salt),
            wrapped_cek: toBase64(wrappedCek),
            chunk_count: chunkCount,
            platform,
            // FIX-1b: create the row directly in its destination folder. For a
            // protected folder the CEK was already wrapped under the folder
            // password above, so the file is born correctly folder-keyed AND
            // folder-filed in one step — no stranding window, no post-move.
            folder_id: itemMeta.get(id)?.folderId ?? folderId ?? null,
          });
          break;
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
      if (!session) throw new Error("Failed to start upload session");
      sessionId = session.session_id;
      useDirectUpload = session.direct_upload;
      setFileId(id, session.file_id);

      // Persist the resume context NOW so a mid-upload failure can continue.
      resume = { sessionId, fileId: session.file_id, cekBytes, chunkCount, chunkSize, directUpload: useDirectUpload, shouldCompress };
      itemMeta.set(id, { ...itemMeta.get(id), resume });
      // Also persist session pointers (NOT the key) so this upload can resume
      // after a page reload — see loadPersistedResume.
      savePersistedResume(file, { sessionId, fileId: session.file_id, chunkCount, chunkSize, directUpload: useDirectUpload, shouldCompress });

      done = new Set();
    }

    // Chunk pipeline — TWO-STAGE BACKPRESSURE:
    //   RELAY:  [worker] -> [upload to server] -> [server relays to platform]
    //   DIRECT: [worker] -> [presign] -> [upload directly to platform] -> [confirm]
    // Direct (HuggingFace LFS) sends data once; relay (GitHub/GitLab/Telegram) twice.
    let uploadedChunks = done.size;
    let totalEncryptedSize = 0;
    let totalCompressedSize = 0;

    // Byte-level progress (fed by xhr.upload.onprogress): completed chunks
    // count their full plaintext size; the in-flight chunk contributes a
    // partial, scaled from wire bytes sent to plaintext bytes, so the bar moves
    // smoothly THROUGH a 4-16MB chunk instead of freezing for its whole flight.
    // Per-chunk values are kept monotonic (Math.max) so a retried chunk doesn't
    // wind the bar backwards.
    const plainSizeOfChunk = (i: number) => Math.min(chunkSize, file.size - i * chunkSize);
    let completedPlainBytes = 0;
    for (const i of done) completedPlainBytes += plainSizeOfChunk(i);
    const inFlightPlainBytes = new Map<number, number>();

    const emitByteProgress = () => {
      // While paused, in-flight chunks must not flip the row back to "uploading".
      if (pausedIds.has(id)) return;
      let inFlight = 0;
      for (const v of inFlightPlainBytes.values()) inFlight += v;
      const bytes = Math.min(completedPlainBytes + inFlight, file.size);
      const fraction = file.size > 0 ? bytes / file.size : uploadedChunks / chunkCount;
      const percent = 3 + Math.round(fraction * 92);
      // Stage names the chunk currently in flight (falls back to the completed
      // count between chunks / at the end).
      const current = Math.min(uploadedChunks + (inFlightPlainBytes.size > 0 ? 1 : 0), chunkCount);
      updateStatus(id, "uploading", percent, `Uploading chunk ${current}/${chunkCount}`, bytes, file.size);
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

    for (let i = 0; i < chunkCount; i++) {
      if (firstError) break;
      // Pause at the chunk boundary: stop launching new chunks. In-flight chunks
      // (already-launched promises) finish and confirm server-side, so their
      // uploaded_chunks state is preserved for a clean resume. We do NOT abort
      // them — the chunk API wrappers don't accept an AbortSignal (contract §3).
      if (pausedIds.has(id)) break;
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
        // Wait for upload slot (limits concurrent network requests)
        await acquireUploadSlot();

        try {
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
            ));
            if (!presign.already_exists) {
              await directUploadToURL(presign.upload_url, presign.upload_headers, encrypted, onChunkProgress);
            }
            await withRetry(() => confirmChunk(
              sessionId, result.chunkIndex, result.sha256, encrypted.byteLength, presign.remote_path, result.compressed
            ));
          } else {
            // RELAY MODE: upload to server (server relays to platform)
            await withRetry(() => uploadChunk(
              sessionId, result.chunkIndex, encrypted, result.sha256, result.compressed, onChunkProgress
            ));
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
        if (!firstError) firstError = err instanceof Error ? err : new Error(String(err));
      });

      chunkPromises.push(chunkPromise);
    }

    await Promise.all(chunkPromises);
    if (firstError) throw firstError;

    // Paused: stop here WITHOUT completing, so the file never lands in the vault
    // while paused. The session and resume context (CEK + sessionId) stay intact
    // so resumeUpload continues from the server's uploaded_chunks (which then
    // hits completeUpload). We check pausedIds at finalize — not just at the
    // chunk-launch boundary — so a small/single-chunk file whose chunks were all
    // already in-flight when the user hit pause still stops here instead of
    // completing anyway.
    if (pausedIds.has(id)) {
      const percent = 3 + Math.round((uploadedChunks / chunkCount) * 92);
      updateStatus(id, "paused", percent, "Paused", completedPlainBytes, file.size);
      return;
    }

    // Finalize
    updateStatus(id, "uploading", 97, "Finalizing...");
    await withRetry(() => completeUpload(sessionId, totalEncryptedSize, totalCompressedSize));

    // FIX-1b: no post-complete moveFile. The file was created in its destination
    // folder atomically at init (initUpload's folder_id), so it is already filed
    // in the right folder AND keyed correctly — there is no stranding window.

    updateStatus(id, "done", 100, "Done");
    itemMeta.set(id, { ...itemMeta.get(id), resume: undefined }); // complete — nothing to resume
    clearPersistedResume(file); // drop the cross-session resume record
    debouncedRefresh(onRefresh);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    const friendlyMsg = msg.includes("storage not available")
      ? "No storage platform connected. Go to Settings to connect one."
      : msg;
    setError(id, friendlyMsg);
    // Deliberately do NOT cancel the session here — keeping it lets the user
    // resume via Retry (skipping chunks already uploaded). The session is
    // cancelled only when the user dismisses the item (removeFromQueue).
  } finally {
    // Batch-shared pools outlive this file — startUpload terminates them once
    // the whole batch settles. Only tear down a pool this call created.
    if (ownsPool) pool.terminate();
  }
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

  updateStatus: (id, status, progress, stage, bytesProcessed, totalBytes) => {
    // Terminal states flush immediately so UI reflects completion/failure.
    // "paused" is not terminal, but we flush it immediately too (and drop any
    // pending batched update for this id) so a stale in-flight progress frame
    // can't overwrite the paused state a frame later.
    if (status === "done" || status === "failed" || status === "paused") {
      pendingUpdates.delete(id);
      set((state) => ({
        queue: state.queue.map((item) =>
          item.id === id
            ? { ...item, status, progress: progress ?? item.progress, stage: stage ?? item.stage, bytesProcessed: bytesProcessed ?? item.bytesProcessed, totalBytes: totalBytes ?? item.totalBytes }
            : item
        ),
      }));
      return;
    }
    // Batch intermediate progress — one render per frame
    pendingUpdates.set(id, { status, progress, stage, bytesProcessed, totalBytes });
    scheduleFlush();
  },

  setError: (id, error) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: "failed" as const, error } : item
      ),
    }));
  },

  removeFromQueue: (id) => {
    // If the item has a live session (failed mid-upload), cancel it server-side
    // so it stops holding a concurrent-upload slot. This is the "give up" path —
    // distinct from Retry, which keeps the session to resume.
    const meta = itemMeta.get(id);
    if (meta?.resume?.sessionId) {
      cancelUpload(meta.resume.sessionId).catch(() => {});
    }
    const item = get().queue.find((i) => i.id === id);
    if (item) clearPersistedResume(item.file); // give up — drop the resume record
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

  startUpload: (files, passphrase, platform, maxConcurrent, onRefresh, hfConnected = false, folderId = null) => {
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
    // Resolve target per file (large files prefer HuggingFace) and remember it so
    // a retry reuses the same target. `folderId` is the destination folder (the
    // current explorer folder) so uploads land where the user is browsing; for a
    // protected folder `passphrase` is already the folder password.
    for (const it of items) {
      const { platform: target, routedToHF } = resolveUploadPlatform(it.file.size, platform, hfConnected);
      itemMeta.set(it.id, { platform: target, onRefresh, routedToHF, folderId });
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
              const target = meta?.platform; // per-file (may be huggingface)
              await uploadOneFile(file, id, { passphrase, platform: target, profile, onRefresh, folderId: meta?.folderId, batchKek, pool });
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
    set((state) => ({
      queue: state.queue.map((i) =>
        i.id === id ? { ...i, status: "queued" as const, error: undefined, progress: 0, stage: "Retrying..." } : i
      ),
    }));
    void uploadOneFile(item.file, id, {
      passphrase,
      platform: meta?.platform,
      profile: getDeviceProfile(),
      onRefresh: meta?.onRefresh,
      folderId: meta?.folderId,
    });
  },

  // Pause an in-progress upload. We CANNOT abort an in-flight chunk (the
  // upload-session wrappers take no AbortSignal — contract §3), so this pauses at
  // the chunk boundary: the running uploadOneFile loop sees pausedIds.has(id)
  // before launching its next chunk and stops, leaving the server session +
  // resume context (CEK, sessionId) untouched. Already-launched chunks finish and
  // their uploaded_chunks state is preserved, so resumeUpload picks up cleanly.
  // We do NOT call cancelUpload — that's the "give up" path (removeFromQueue).
  pauseUpload: (id) => {
    const item = get().queue.find((i) => i.id === id);
    if (!item) return;
    // Only meaningful while actively encrypting/uploading; ignore terminal states.
    if (item.status === "done" || item.status === "failed" || item.status === "paused") return;
    pausedIds.add(id);
    // Reflect the intent immediately. The loop will also emit "paused" once the
    // last in-flight chunk settles; this gives instant feedback in the meantime.
    get().updateStatus(id, "paused", item.progress, "Pausing…", item.bytesProcessed, item.totalBytes);
  },

  // Resume a paused upload. Clears the paused flag and re-runs uploadOneFile,
  // which reads itemMeta[id].resume and continues from getUploadStatus's
  // uploaded_chunks — re-encrypting only the remaining chunks with the SAME CEK.
  // Same continuation path as retryUpload, just from a "paused" (not "failed") state.
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
    void uploadOneFile(item.file, id, {
      passphrase,
      platform: meta?.platform,
      profile: getDeviceProfile(),
      onRefresh: meta?.onRefresh,
      folderId: meta?.folderId,
    });
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
