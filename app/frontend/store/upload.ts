import { create } from "zustand";
import type { UploadItem, UploadStatus } from "@/types";
import { toast } from "@/store/toast";
import { WorkerPool } from "@/lib/worker-pool";
import { generateSalt, deriveKeyBytes, sha256Hex, toBase64, CHUNK_SIZE } from "@/lib/crypto";
import { initUpload, uploadChunk, completeUpload } from "@/lib/upload-session";

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

  startUpload: (files, passphrase, platform, maxConcurrent = 2, onRefresh) => {
    const { addToQueue, updateStatus, setFileId, setError } = get();

    // Add all files to queue immediately so UI shows them all
    const items = files.map((file) => ({
      file,
      id: addToQueue(file),
    }));

    // Process a single file through the client-side crypto pipeline
    const processOne = async (file: File, id: string) => {
      const pool = new WorkerPool();

      try {
        // Step 1: Hash original file
        updateStatus(id, "encrypting", 5, "Hashing file...", 0, file.size);
        const fileBuffer = await file.arrayBuffer();
        const fileSha256 = await sha256Hex(new Uint8Array(fileBuffer));

        // Step 2: Generate salt & derive key
        updateStatus(id, "encrypting", 10, "Deriving encryption key...");
        const salt = generateSalt();
        const keyBytes = await deriveKeyBytes(passphrase, salt);

        // Step 3: Calculate chunks
        const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

        // Step 4: Init upload session on server
        updateStatus(id, "encrypting", 15, "Starting upload session...");
        const session = await initUpload({
          filename: file.name,
          original_size: file.size,
          sha256: fileSha256,
          salt: toBase64(salt),
          chunk_count: chunkCount,
          platform,
        });
        setFileId(id, session.file_id);

        // Step 5: Process and upload chunks
        let uploadedChunks = 0;
        let totalEncryptedSize = 0;
        let totalCompressedSize = 0;

        const chunkPromises: Promise<void>[] = [];

        for (let i = 0; i < chunkCount; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          // Lazy slice via File.slice() — only this chunk in RAM
          const chunkSlice = file.slice(start, end);
          const chunkData = await chunkSlice.arrayBuffer();

          // Send to worker for compress -> encrypt -> hash
          const workerPromise = pool.process({
            chunkIndex: i,
            plaintext: chunkData, // transferred, not copied
            keyBytes: keyBytes.slice(0), // copy since buffer gets neutered on transfer
            compress: true,
          }).then(async (result) => {
            // Upload encrypted chunk to server
            const encrypted = new Uint8Array(result.encrypted);
            await uploadChunk(
              session.session_id,
              result.chunkIndex,
              encrypted,
              result.sha256,
              result.compressed
            );

            uploadedChunks++;
            totalEncryptedSize += result.encryptedSize;
            totalCompressedSize += result.compressed ? result.compressedSize : result.originalSize;

            const percent = 15 + Math.round((uploadedChunks / chunkCount) * 80);
            updateStatus(
              id,
              "uploading",
              percent,
              `Uploading chunk ${uploadedChunks}/${chunkCount}`,
              uploadedChunks * CHUNK_SIZE,
              file.size
            );
          });

          chunkPromises.push(workerPromise);
        }

        await Promise.all(chunkPromises);

        // Step 6: Complete upload
        updateStatus(id, "uploading", 95, "Finalizing...");
        await completeUpload(session.session_id, totalEncryptedSize, totalCompressedSize);

        updateStatus(id, "done", 100, "Done");
        toast.success(`${file.name} uploaded`);
        onRefresh?.();
      } catch (err) {
        setError(id, err instanceof Error ? err.message : "Upload failed");
        toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        pool.terminate();
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
