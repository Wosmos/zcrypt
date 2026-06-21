import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";
import { toast } from "@/store/toast";
import { WorkerPool } from "@/lib/worker-pool";
import { generateSalt, deriveKeyBytes, generateCEK, wrapKey, sha256File, toBase64 } from "@/lib/crypto";
import { initUpload, uploadChunk, completeUpload, presignChunk, directUploadToURL, confirmChunk, cancelUpload } from "@/lib/upload-session";
import { getDeviceProfile } from "@/lib/device-profile";
import { isTauri, localUpload, tauriInvoke } from "@/lib/tauri";

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
    const bar = "\u2593".repeat(filled) + "\u2591".repeat(barLen - filled);

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
  startUpload: (files: File[], passphrase: string, platform?: string, maxConcurrent?: number, onRefresh?: () => void) => void;
  startDesktopUpload: (passphrase: string, onRefresh?: () => void) => void;
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
    // Terminal states flush immediately so UI reflects completion/failure
    if (status === "done" || status === "failed") {
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

  startUpload: (files, passphrase, platform, maxConcurrent, onRefresh) => {
    const { addBatchToQueue, updateStatus, setFileId, setError } = get();
    const profile = getDeviceProfile();
    const chunkSize = profile.chunkSize;
    const effectiveConcurrent = maxConcurrent ?? profile.maxConcurrentUploads;

    // Add all files to queue in a single state update (prevents 10k re-renders)
    const items = addBatchToQueue(files);

    // File extensions that are already compressed — skip zstd to save CPU
    const COMPRESSED_EXTENSIONS = new Set([
      "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif",
      "mp4", "mkv", "avi", "mov", "webm", "flv", "m4v",
      "mp3", "aac", "ogg", "flac", "opus", "wma", "m4a",
      "zip", "rar", "7z", "gz", "bz2", "xz", "zst", "lz4", "br", "tar.gz",
      "pdf", "docx", "xlsx", "pptx", "woff", "woff2",
    ]);

    // Retry wrapper for rate-limited API calls
    const withRetry = async <T,>(fn: () => Promise<T>, maxRetries = 5): Promise<T> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isRateLimit = msg.includes("too many requests") || msg.includes("slow down");
          if (isRateLimit && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) + Math.random() * 1000));
            continue;
          }
          throw err;
        }
      }
      throw new Error("Max retries exceeded");
    };

    // Process a single file through the client-side crypto pipeline
    const processOne = async (file: File, id: string) => {
      // Desktop: handled by startDesktopUpload() — should not reach here.
      // If it does, fall through to the web pipeline as a safe fallback.

      const pool = new WorkerPool();
      let sessionId: string | null = null;

      try {
        // Step 1: Hash original file
        updateStatus(id, "encrypting", 1, "Hashing file...", 0, file.size);
        const fileSha256 = await sha256File(file);

        // Step 2: Generate salt, derive KEK, and create a per-file CEK.
        // Envelope encryption: chunks are encrypted with a random CEK; the CEK
        // is wrapped with the passphrase-derived KEK and stored alongside the
        // file. This decouples file content from the passphrase so a file can be
        // shared (by wrapping its CEK with a share key) without revealing it.
        updateStatus(id, "encrypting", 2, "Deriving encryption key...");
        const salt = generateSalt();
        const kekBytes = await deriveKeyBytes(passphrase, salt);
        const cek = generateCEK();
        const wrappedCek = await wrapKey(kekBytes, cek);
        // The CEK is what actually encrypts chunk data.
        const cekBytes = cek.buffer.slice(0) as ArrayBuffer;

        // Step 3: Calculate chunks (device-aware chunk size)
        const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));

        // Skip compression for already-compressed file formats
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const shouldCompress = !COMPRESSED_EXTENSIONS.has(ext);

        // Step 4: Init upload session on server (with retry for 429 "too many concurrent")
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
        setFileId(id, session.file_id);

        const useDirectUpload = session.direct_upload;

        // Step 5: Process and upload chunks with TWO-STAGE BACKPRESSURE
        //
        // Two modes:
        //   RELAY:  [worker] → [upload to server] → [server relays to platform]
        //   DIRECT: [worker] → [presign] → [upload directly to platform] → [confirm]
        //
        // Direct mode eliminates the double-hop — data travels once instead of twice.
        // Used for HuggingFace (presigned LFS URLs). GitHub still uses relay.
        let uploadedChunks = 0;
        let totalEncryptedSize = 0;
        let totalCompressedSize = 0;

        // Pipeline depth: allow workers to pre-process several chunks ahead of uploads.
        const pipelineDepth = Math.min(profile.workers * 3, 12);
        let pipelineSlots = 0;
        const pipelineWaiters: (() => void)[] = [];

        const acquirePipelineSlot = (): Promise<void> => {
          if (pipelineSlots < pipelineDepth) {
            pipelineSlots++;
            return Promise.resolve();
          }
          return new Promise<void>((resolve) => pipelineWaiters.push(resolve));
        };

        const releasePipelineSlot = () => {
          pipelineSlots--;
          const next = pipelineWaiters.shift();
          if (next) {
            pipelineSlots++;
            next();
          }
        };

        // Upload concurrency: limit simultaneous network uploads.
        // Direct mode can use more slots since data doesn't pass through server.
        const maxUploads = useDirectUpload ? 6 : 5;
        let activeUploads = 0;
        const uploadWaiters: (() => void)[] = [];

        const acquireUploadSlot = (): Promise<void> => {
          if (activeUploads < maxUploads) {
            activeUploads++;
            return Promise.resolve();
          }
          return new Promise<void>((resolve) => uploadWaiters.push(resolve));
        };

        const releaseUploadSlot = () => {
          activeUploads--;
          const next = uploadWaiters.shift();
          if (next) {
            activeUploads++;
            next();
          }
        };

        const chunkPromises: Promise<void>[] = [];
        let firstError: Error | null = null;

        for (let i = 0; i < chunkCount; i++) {
          if (firstError) break;

          // Backpressure: don't read ahead more than pipelineDepth chunks
          await acquirePipelineSlot();

          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunkSlice = file.slice(start, end);
          const chunkData = await chunkSlice.arrayBuffer();

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

              if (useDirectUpload) {
                // DIRECT MODE: presign → upload to platform → confirm
                const presign = await withRetry(() => presignChunk(
                  session!.session_id,
                  result.chunkIndex,
                  result.sha256,
                  encrypted.byteLength
                ));

                if (!presign.already_exists) {
                  await directUploadToURL(
                    presign.upload_url,
                    presign.upload_headers,
                    encrypted
                  );
                }

                await withRetry(() => confirmChunk(
                  session!.session_id,
                  result.chunkIndex,
                  result.sha256,
                  encrypted.byteLength,
                  presign.remote_path,
                  result.compressed
                ));
              } else {
                // RELAY MODE: upload to server (server relays to platform)
                await withRetry(() => uploadChunk(
                  session!.session_id,
                  result.chunkIndex,
                  encrypted,
                  result.sha256,
                  result.compressed
                ));
              }

              uploadedChunks++;
              totalEncryptedSize += result.encryptedSize;
              totalCompressedSize += result.compressed ? result.compressedSize : result.originalSize;

              const percent = 3 + Math.round((uploadedChunks / chunkCount) * 92);
              updateStatus(
                id,
                "uploading",
                percent,
                `Uploading chunk ${uploadedChunks}/${chunkCount}`,
                uploadedChunks * chunkSize,
                file.size
              );
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

        // Step 6: Complete upload
        updateStatus(id, "uploading", 97, "Finalizing...");
        await withRetry(() => completeUpload(session!.session_id, totalEncryptedSize, totalCompressedSize));

        updateStatus(id, "done", 100, "Done");
        // No per-file toast — batch summary shown when all finish
        debouncedRefresh(onRefresh);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        // Translate backend errors to user-friendly messages
        const friendlyMsg = msg.includes("storage not available")
          ? "No storage platform connected. Go to Settings to connect one."
          : msg;
        setError(id, friendlyMsg);
        // Cancel the server-side session to free the concurrent slot
        if (sessionId) {
          cancelUpload(sessionId).catch(() => {});
        }
      } finally {
        pool.terminate();
      }
    };

    // Semaphore-based concurrency limiter
    let running = 0;
    const waiting: (() => void)[] = [];

    const acquire = async () => {
      if (running < effectiveConcurrent) {
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

    // Launch all uploads with concurrency control, show summary when done
    void Promise.all(
      items.map(async ({ file, id }) => {
        await acquire();
        try {
          await processOne(file, id);
        } finally {
          release();
        }
      })
    ).then(() => {
      stopBackgroundNotifications();
      // Batch complete — show a single summary toast
      const { queue } = get();
      const batchItems = queue.filter((q) => batchIds.has(q.id));
      const doneCount = batchItems.filter((i) => i.status === "done").length;
      const failedCount = batchItems.filter((i) => i.status === "failed").length;
      const total = batchItems.length;

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

      onRefresh?.();
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
