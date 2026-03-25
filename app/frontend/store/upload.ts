import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";
import { toast } from "@/store/toast";
import { WorkerPool } from "@/lib/worker-pool";
import { generateSalt, deriveKeyBytes, sha256File, toBase64 } from "@/lib/crypto";
import { initUpload, uploadChunk, completeUpload, presignChunk, directUploadToURL, confirmChunk } from "@/lib/upload-session";
import { getDeviceProfile } from "@/lib/device-profile";

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
  setFileId: (id: string, fileId: string) => void;
  updateStatus: (id: string, status: UploadStatus, progress?: number, stage?: string, bytesProcessed?: number, totalBytes?: number) => void;
  setError: (id: string, error: string) => void;
  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
  findByFileId: (fileId: string) => UploadItem | undefined;
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
    const { addToQueue, updateStatus, setFileId, setError } = get();
    const profile = getDeviceProfile();
    const chunkSize = profile.chunkSize;
    const effectiveConcurrent = maxConcurrent ?? profile.maxConcurrentUploads;

    // Add all files to queue immediately so UI shows them all
    const items = files.map((file) => ({
      file,
      id: addToQueue(file),
    }));

    // File extensions that are already compressed — skip zstd to save CPU
    const COMPRESSED_EXTENSIONS = new Set([
      "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif",
      "mp4", "mkv", "avi", "mov", "webm", "flv", "m4v",
      "mp3", "aac", "ogg", "flac", "opus", "wma", "m4a",
      "zip", "rar", "7z", "gz", "bz2", "xz", "zst", "lz4", "br", "tar.gz",
      "pdf", "docx", "xlsx", "pptx", "woff", "woff2",
    ]);

    // Process a single file through the client-side crypto pipeline
    const processOne = async (file: File, id: string) => {
      const pool = new WorkerPool();

      try {
        // Step 1: Hash original file
        updateStatus(id, "encrypting", 1, "Hashing file...", 0, file.size);
        const fileSha256 = await sha256File(file);

        // Step 2: Generate salt & derive key
        updateStatus(id, "encrypting", 2, "Deriving encryption key...");
        const salt = generateSalt();
        const keyBytes = await deriveKeyBytes(passphrase, salt);

        // Step 3: Calculate chunks (device-aware chunk size)
        const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));

        // Skip compression for already-compressed file formats
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const shouldCompress = !COMPRESSED_EXTENSIONS.has(ext);

        // Step 4: Init upload session on server
        updateStatus(id, "encrypting", 3, "Starting upload session...");
        const session = await initUpload({
          filename: file.name,
          original_size: file.size,
          sha256: fileSha256,
          salt: toBase64(salt),
          chunk_count: chunkCount,
          platform,
        });
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
            keyBytes: keyBytes.slice(0), // copy since buffer gets neutered on transfer
            compress: shouldCompress,
            compressionLevel: profile.compressionLevel,
          }).then(async (result) => {
            // Wait for upload slot (limits concurrent network requests)
            await acquireUploadSlot();

            try {
              const encrypted = new Uint8Array(result.encrypted);

              if (useDirectUpload) {
                // DIRECT MODE: presign → upload to platform → confirm
                const presign = await presignChunk(
                  session.session_id,
                  result.chunkIndex,
                  result.sha256,
                  encrypted.byteLength
                );

                if (!presign.already_exists) {
                  await directUploadToURL(
                    presign.upload_url,
                    presign.upload_headers,
                    encrypted
                  );
                }

                await confirmChunk(
                  session.session_id,
                  result.chunkIndex,
                  result.sha256,
                  encrypted.byteLength,
                  presign.remote_path,
                  result.compressed
                );
              } else {
                // RELAY MODE: upload to server (server relays to platform)
                await uploadChunk(
                  session.session_id,
                  result.chunkIndex,
                  encrypted,
                  result.sha256,
                  result.compressed
                );
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
        await completeUpload(session.session_id, totalEncryptedSize, totalCompressedSize);

        updateStatus(id, "done", 100, "Done");
        toast.success(`${file.name} uploaded`);
        onRefresh?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        // Translate backend errors to user-friendly messages
        const friendlyMsg = msg.includes("storage not available")
          ? "No storage platform connected. Go to Settings to connect one."
          : msg.includes("file too large")
            ? msg.replace(/\(max \d+ bytes\)/, `(upgrade your plan for larger files)`)
            : msg.includes("quota exceeded")
              ? "Storage quota exceeded. Delete files or upgrade your plan."
              : msg;
        setError(id, friendlyMsg);
        toast.error(friendlyMsg);
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

    // Fire-and-forget: launch all uploads with concurrency control
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
