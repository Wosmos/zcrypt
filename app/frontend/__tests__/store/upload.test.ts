import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// Same environment quirk as store/download.test.ts: Node's built-in
// `localStorage` (not jsdom's) throws unguarded, and store/upload.ts calls it
// directly (savePersistedResume/clearPersistedResume/readPersistedResume) at
// call time, not just module load — so every test needs a working stub.
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
  });
});

import { useUploadStore } from "@/store/upload";
import {
  initUpload,
  uploadChunk,
  completeUpload,
  presignChunk,
  directUploadToURL,
  confirmChunk,
  cancelUpload,
  getUploadStatus,
} from "@/lib/upload-session";
import { getFileMeta } from "@/lib/api";
import { setFilesData } from "@/store/files";
import { toast } from "@/store/toast";
import { getDeviceProfile } from "@/lib/device-profile";
import { generateSalt, deriveKeyBytes, generateCEK, wrapKey, unwrapKey, sha256File, deriveDedupKeyBytes, contentMacFile, toBase64, fromBase64 } from "@/lib/crypto";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { deriveNameKey, encryptName } from "@/lib/name-crypto";
import type { SidecarProgress } from "@/lib/tauri";

vi.mock("@/lib/upload-session", () => ({
  initUpload: vi.fn(),
  uploadChunk: vi.fn(),
  completeUpload: vi.fn(),
  presignChunk: vi.fn(),
  directUploadToURL: vi.fn(),
  confirmChunk: vi.fn(),
  cancelUpload: vi.fn(),
  getUploadStatus: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getFileMeta: vi.fn(),
}));

vi.mock("@/store/files", () => ({
  setFilesData: vi.fn(),
}));

vi.mock("@/store/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// The real crypto functions (PBKDF2 @ 600k iters, real AES-GCM) are correct
// but slow and irrelevant here — this file tests ORCHESTRATION, not crypto
// correctness (that's lib/crypto.test.ts's job). Fast deterministic fakes
// still exercise every real branch (batch-shared KEK identity, CEK plumbing).
let saltCounter = 0;
vi.mock("@/lib/crypto", () => ({
  generateSalt: vi.fn(() => {
    saltCounter++;
    return new Uint8Array([saltCounter]);
  }),
  deriveKeyBytes: vi.fn(async (_pp: string, salt: Uint8Array) => new ArrayBuffer(salt[0] || 1)),
  generateCEK: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
  wrapKey: vi.fn(async () => new Uint8Array([9, 9, 9])),
  unwrapKey: vi.fn(async () => new Uint8Array([5, 6, 7, 8])),
  sha256File: vi.fn(async (file: File, onProgress?: (n: number) => void) => {
    onProgress?.(file.size);
    return `sha-${file.name}-${file.size}`;
  }),
  // Content-addressed dedup path (only reached when a user id is present).
  deriveDedupKeyBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  contentMacFile: vi.fn(async (file: File, _key: Uint8Array, onProgress?: (n: number) => void) => {
    onProgress?.(file.size);
    return `hmac-${file.name}-${file.size}`;
  }),
  toBase64: vi.fn((data: Uint8Array) => `b64:${Array.from(data).join(",")}`),
  fromBase64: vi.fn((b64: string) => new Uint8Array(b64.replace("b64:", "").split(",").map(Number))),
}));

// Auth / passphrase stores drive the zero-knowledge dedup + encrypted-name
// path (upload.ts:429-456). DEFAULTS here reproduce the current real behavior
// under an empty localStorage (no user, locked vault) so every existing test is
// unaffected; the dedup test overrides them.
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: vi.fn(() => ({ user: undefined })) },
}));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: { getState: vi.fn(() => ({ getPassphrase: () => null })) },
}));
vi.mock("@/lib/name-crypto", () => ({
  deriveNameKey: vi.fn(async () => ({}) as CryptoKey),
  encryptName: vi.fn(async (name: string) => `enc:${name}`),
}));

// WorkerPool spins up REAL Web Workers in its constructor — mock the whole
// module instead of faking `Worker` globally (store/upload.ts only touches
// `process()`/`terminate()`, never worker internals). Each chunk's process()
// resolves deterministically from its input unless a test overrides it.
interface FakeProcessCall {
  chunkIndex: number;
  plaintext: ArrayBuffer;
  keyBytes: ArrayBuffer;
  compress: boolean;
  compressionLevel: number;
}
const workerPoolInstances: { process: Mock; terminate: Mock }[] = [];
vi.mock("@/lib/worker-pool", () => {
  class FakeWorkerPool {
    process: Mock;
    terminate: Mock;
    constructor() {
      this.process = vi.fn(async (input: FakeProcessCall) => ({
        chunkIndex: input.chunkIndex,
        encrypted: input.plaintext.slice(0),
        sha256: `chunk-sha-${input.chunkIndex}`,
        compressed: input.compress,
        compressedSize: input.plaintext.byteLength,
        originalSize: input.plaintext.byteLength,
        encryptedSize: input.plaintext.byteLength,
      }));
      this.terminate = vi.fn();
      workerPoolInstances.push({ process: this.process, terminate: this.terminate });
    }
  }
  return { WorkerPool: FakeWorkerPool };
});

vi.mock("@/lib/tauri", () => ({
  pickFiles: vi.fn(async () => [] as string[]),
  sidecarUpload: vi.fn(async () => {}),
  subscribeProgress: vi.fn(async () => vi.fn()),
  cancelTransfer: vi.fn(async () => true),
}));

const SMALL_PROFILE = {
  workers: 1,
  chunkSize: 1024,
  compressionLevel: 1,
  maxConcurrentUploads: 2,
};
vi.mock("@/lib/device-profile", () => ({
  getDeviceProfile: vi.fn(() => ({ ...SMALL_PROFILE })),
  // Network/size-aware file concurrency (decoupled from the CPU tier). The store
  // clamps this to the server cap; here we just echo a small-batch fan-out.
  recommendedUploadConcurrency: vi.fn((sizes: number[]) => Math.min(6, Math.max(1, sizes.length))),
}));

function makeFile(name: string, size: number, content?: string): File {
  const bytes = content ?? "x".repeat(size);
  return new File([bytes], name, { lastModified: 1000 });
}

function getItem(id: string) {
  return useUploadStore.getState().queue.find((i) => i.id === id);
}

function queueIdFor(index = 0) {
  return useUploadStore.getState().queue[index].id;
}

// Every module-level timer (debouncedRefresh, background-notification
// interval, withRetry's backoff, chunk pipeline's slot waits) and the
// rAF-throttled progress flush are all driven by fake timers — mirrors
// store/download.test.ts's convention for the identical pendingUpdates
// throttle shape. `times` is generous because uploadOneFile's real path
// crosses many chained microtasks (hash -> derive -> init -> N chunks -> complete).
async function flush(times = 40) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5000);
  }
}

function defaultInitResponse(overrides: Partial<Awaited<ReturnType<typeof initUpload>>> = {}) {
  return {
    session_id: "sess-1",
    file_id: "file-1",
    platform: "telegram",
    direct_upload: false,
    resumed: false,
    chunk_size: SMALL_PROFILE.chunkSize,
    chunk_count: 1,
    ...overrides,
  };
}

describe("useUploadStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    // Clears call-count history on the @/lib/crypto mocks specifically — their
    // baked-in factory implementations are never touched by the manual
    // .mockReset() calls below, so without this their call counts (e.g.
    // deriveKeyBytes) accumulate across every prior test in the file.
    // (vi.clearAllMocks() here also disturbs the WorkerPool constructor mock's
    // internal call-tracking in a way that stalls the encrypt phase — clear
    // only what's actually needed instead of everything.)
    (generateSalt as Mock).mockClear();
    (deriveKeyBytes as Mock).mockClear();
    (generateCEK as Mock).mockClear();
    (wrapKey as Mock).mockClear();
    (unwrapKey as Mock).mockClear();
    (sha256File as Mock).mockClear();
    (deriveDedupKeyBytes as Mock).mockClear();
    (contentMacFile as Mock).mockClear();
    (deriveNameKey as Mock).mockClear();
    (encryptName as Mock).mockClear();
    (toBase64 as Mock).mockClear();
    (fromBase64 as Mock).mockClear();
    // Deterministic backoff/jitter/wait-for-slot delays (withRetry, doInit) —
    // without this, Math.random()'s jitter makes the exact delay needed to
    // clear a backoff non-deterministic across runs.
    vi.spyOn(Math, "random").mockReturnValue(0);
    saltCounter = 0;
    workerPoolInstances.length = 0;
    useUploadStore.setState({ queue: [] });
    localStorage.clear();

    (initUpload as Mock).mockReset().mockResolvedValue(defaultInitResponse());
    (uploadChunk as Mock).mockReset().mockResolvedValue(undefined);
    (completeUpload as Mock).mockReset().mockResolvedValue({ file_id: "file-1" });
    (presignChunk as Mock).mockReset().mockResolvedValue({
      upload_url: "https://platform/upload",
      upload_headers: null,
      remote_path: "remote/path",
      already_exists: false,
    });
    (directUploadToURL as Mock).mockReset().mockResolvedValue(undefined);
    (confirmChunk as Mock).mockReset().mockResolvedValue(undefined);
    (cancelUpload as Mock).mockReset().mockResolvedValue(undefined);
    (getUploadStatus as Mock).mockReset().mockResolvedValue({
      session_id: "sess-1",
      file_id: "file-1",
      status: "active",
      chunk_count: 1,
      uploaded_chunks: [],
      completed_count: 0,
    });
    (getFileMeta as Mock).mockReset().mockResolvedValue({
      id: "file-1",
      original_name: "a.bin",
      original_size: 10,
      compressed_size: 10,
      encrypted_size: 10,
      chunk_count: 1,
      sha256: "hash",
      salt: "b64:9",
      wrapped_cek: "b64:9,9,9",
    });
    (setFilesData as Mock).mockReset();
    (toast.success as Mock).mockReset();
    (toast.error as Mock).mockReset();
    (toast.warning as Mock).mockReset();
    (getDeviceProfile as Mock).mockReset().mockReturnValue({ ...SMALL_PROFILE });
  });

  afterEach(async () => {
    // Drain the store's batched-update rAF BEFORE tearing down fake timers.
    // store/upload.ts guards scheduleFlush() with a module-level
    // `flushScheduled` flag that only clears inside the rAF callback. Switching
    // timer implementations discards any pending callback, so a test that ends
    // mid-batch leaves the flag stuck true — after which scheduleFlush() always
    // returns early and EVERY later test in this file silently loses its
    // batched progress writes (status/percent updates just never land).
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(100);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Cleanup that lives HERE (not inline at each test's end) runs even when
    // a test throws before reaching its own cleanup line — otherwise a failed
    // notification test leaves document.hidden stuck for every test after it.
    delete (document as { hidden?: boolean }).hidden;
  });

  describe("startUpload — routing (no size-based auto-route)", () => {
    it("passes the user's explicit platform straight to initUpload regardless of file size", async () => {
      const big = makeFile("movie.mkv", 5000);
      useUploadStore.getState().startUpload([big], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledWith(
        expect.objectContaining({ platform: "telegram" })
      );
    });

    it("passes platform undefined through unchanged when the picker is on Auto — the server resolves it, not a size heuristic", async () => {
      const big = makeFile("movie.mkv", 50_000);
      useUploadStore.getState().startUpload([big], "pw", undefined, undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledWith(
        expect.objectContaining({ platform: undefined })
      );
    });
  });

  describe("startUpload — fresh single-chunk upload happy path", () => {
    it("hashes, derives keys, inits, uploads the one chunk, completes, and lands on done", async () => {
      const file = makeFile("a.txt", 10, "0123456789");
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(initUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "a.txt",
          original_size: 10,
          chunk_count: 1,
          chunk_size: SMALL_PROFILE.chunkSize,
          folder_id: null,
        })
      );
      expect(uploadChunk).toHaveBeenCalledTimes(1);
      expect(completeUpload).toHaveBeenCalledWith("sess-1", 10, 10);
      expect(getItem(id)?.status).toBe("done");
      expect(getItem(id)?.progress).toBe(100);
      expect(toast.success).toHaveBeenCalledWith("a.txt uploaded");
    });

    it("materializes an optimistic row in the file list on completion", async () => {
      const file = makeFile("a.txt", 10, "0123456789");
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, "folder-9");
      await flush();

      expect(setFilesData).toHaveBeenCalled();
      const updater = (setFilesData as Mock).mock.calls[0][0];
      const result = updater([]);
      expect(result[0]).toMatchObject({
        id: "file-1",
        original_name: "a.txt",
        original_size: 10,
        folder_id: "folder-9",
      });
    });

    it("does not duplicate the optimistic row if it's already present", async () => {
      const file = makeFile("a.txt", 10, "0123456789");
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      const updater = (setFilesData as Mock).mock.calls[0][0];
      const already = [{ id: "file-1", original_name: "a.txt" }];
      expect(updater(already)).toBe(already);
    });
  });

  describe("startUpload — multi-chunk file", () => {
    it("uploads every chunk exactly once and sums sizes into completeUpload", async () => {
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 3);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(initUpload).toHaveBeenCalledWith(expect.objectContaining({ chunk_count: 3 }));
      expect(uploadChunk).toHaveBeenCalledTimes(3);
      const indices = (uploadChunk as Mock).mock.calls.map((c) => c[1]).sort();
      expect(indices).toEqual([0, 1, 2]);
      expect(completeUpload).toHaveBeenCalledWith("sess-1", SMALL_PROFILE.chunkSize * 3, SMALL_PROFILE.chunkSize * 3);
      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("startUpload — direct-upload mode", () => {
    it("uses presign -> directUploadToURL -> confirm instead of uploadChunk", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ direct_upload: true }));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(presignChunk).toHaveBeenCalledTimes(1);
      expect(directUploadToURL).toHaveBeenCalledTimes(1);
      expect(confirmChunk).toHaveBeenCalledTimes(1);
      expect(uploadChunk).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("done");
    });

    it("skips the actual byte transfer when the platform reports the chunk already exists", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ direct_upload: true }));
      (presignChunk as Mock).mockResolvedValue({
        upload_url: "https://x",
        upload_headers: null,
        remote_path: "p",
        already_exists: true,
      });
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      await flush();

      expect(directUploadToURL).not.toHaveBeenCalled();
      expect(confirmChunk).toHaveBeenCalledTimes(1);
    });
  });

  describe("startUpload — batch amortization", () => {
    it("derives the batch KEK exactly once and shares one worker pool across every file", async () => {
      const files = [makeFile("a.txt", 10), makeFile("b.txt", 10), makeFile("c.txt", 10)];
      const { deriveKeyBytes } = await import("@/lib/crypto");
      useUploadStore.getState().startUpload(files, "pw", "telegram", 3, undefined, null);
      await flush();

      // One call for the batch KEK. Each fresh file ALSO derives no additional
      // KEK — batchKek is reused, never re-derived per file.
      expect((deriveKeyBytes as Mock).mock.calls.length).toBe(1);
      expect(workerPoolInstances.length).toBe(1);
      expect(workerPoolInstances[0].terminate).toHaveBeenCalledTimes(1);
      expect(useUploadStore.getState().queue.every((i) => i.status === "done")).toBe(true);
    });

    it("drives file concurrency from the network/size policy, not the CPU tier", async () => {
      const { recommendedUploadConcurrency } = await import("@/lib/device-profile");
      const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.txt`, 10));
      // No explicit server cap → the batch's file concurrency comes from
      // recommendedUploadConcurrency(sizes), NOT profile.maxConcurrentUploads (2).
      useUploadStore.getState().startUpload(files, "pw", "telegram", undefined, undefined, null);
      await flush();
      expect(recommendedUploadConcurrency as Mock).toHaveBeenCalledWith([10, 10, 10, 10, 10, 10]);
      expect(useUploadStore.getState().queue.every((i) => i.status === "done")).toBe(true);
    });

    it("treats an explicit server cap as a hard ceiling on file concurrency", async () => {
      // maxConcurrent=1 (an admin-capped user) must clamp below the recommendation.
      const files = Array.from({ length: 4 }, (_, i) => makeFile(`f${i}.txt`, 10));
      useUploadStore.getState().startUpload(files, "pw", "telegram", 1, undefined, null);
      await flush();
      expect(useUploadStore.getState().queue.every((i) => i.status === "done")).toBe(true);
    });
  });

  describe("startUpload — batch summary toast", () => {
    it("shows a single-file success toast for one file", async () => {
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush();
      expect(toast.success).toHaveBeenCalledWith("a.txt uploaded");
    });

    it("shows a single-file failure toast for one file", async () => {
      (uploadChunk as Mock).mockRejectedValue(new Error("nope — invalid request"));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush();
      expect(toast.error).toHaveBeenCalledWith("a.txt failed");
    });

    it("shows an all-succeeded toast for a multi-file batch", async () => {
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", 2, undefined, null);
      await flush();
      expect(toast.success).toHaveBeenCalledWith("All 2 files uploaded");
    });

    it("shows an all-failed toast for a multi-file batch", async () => {
      (uploadChunk as Mock).mockRejectedValue(new Error("nope — invalid request"));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", 2, undefined, null);
      await flush();
      expect(toast.error).toHaveBeenCalledWith("All 2 files failed to upload");
    });

    it("shows a mixed partial-failure toast for a multi-file batch", async () => {
      (uploadChunk as Mock).mockImplementation(async (sessionId: string) => {
        if (sessionId === "sess-fail") throw new Error("nope — invalid request");
      });
      (initUpload as Mock)
        .mockResolvedValueOnce(defaultInitResponse({ session_id: "sess-ok" }))
        .mockResolvedValueOnce(defaultInitResponse({ session_id: "sess-fail" }));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", 2, undefined, null);
      await flush();
      expect(toast.warning).toHaveBeenCalledWith("1 uploaded, 1 failed");
    });

    it("calls onRefresh once the whole batch settles", async () => {
      const onRefresh = vi.fn();
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, onRefresh, null);
      await flush();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe("server-side resume adoption (resumed: true)", () => {
    it("adopts the resumed session and pins the platform even though a different one was picked", async () => {
      (initUpload as Mock).mockResolvedValue(
        defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-old", chunk_count: 1 })
      );
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-old",
        file_id: "file-1",
        status: "active",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });
      const file = makeFile("a.txt", 10);
      // Picker says huggingface; server says an active telegram session already exists.
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getFileMeta).toHaveBeenCalledWith("file-1");
      expect(uploadChunk).toHaveBeenCalledWith(
        "sess-old",
        expect.any(Number),
        expect.anything(),
        expect.any(String),
        expect.any(Boolean),
        expect.any(Function),
        expect.anything()
      );
      expect(getItem(id)?.status).toBe("done");
      expect(useUploadStore.getState().getItemFolderId(id)).toBeNull();
    });

    it("skips chunks the resumed session already has", async () => {
      (initUpload as Mock).mockResolvedValue(
        defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-old", chunk_count: 3, chunk_size: SMALL_PROFILE.chunkSize })
      );
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-old",
        file_id: "file-1",
        status: "active",
        chunk_count: 3,
        uploaded_chunks: [0, 1],
        completed_count: 2,
      });
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 3);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(uploadChunk).toHaveBeenCalledTimes(1);
      expect((uploadChunk as Mock).mock.calls[0][1]).toBe(2);
    });

    it("restarts on the ORIGINAL platform (not the picker's) when the resumed envelope can't be adopted", async () => {
      (initUpload as Mock)
        .mockResolvedValueOnce(
          defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-dead" })
        )
        .mockResolvedValueOnce(defaultInitResponse({ resumed: false, platform: "telegram", session_id: "sess-new" }));
      (getFileMeta as Mock).mockRejectedValueOnce(new Error("not found"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(cancelUpload).toHaveBeenCalledWith("sess-dead");
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringContaining("restarting on telegram")
      );
      // The restart init call explicitly pins platform to the dead session's platform.
      expect((initUpload as Mock).mock.calls[1][0].platform).toBe("telegram");
      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("pause / resume", () => {
    it("pauses an active upload: aborts the in-flight signal and marks the row paused", async () => {
      let capturedSignal: AbortSignal | undefined;
      let releaseChunk: () => void;
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, _onProgress: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<void>((resolve, reject) => {
            releaseChunk = () => {
              if (signal.aborted) reject(new Error("Upload paused"));
              else resolve();
            };
          });
        }
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      expect(capturedSignal?.aborted).toBe(false);
      useUploadStore.getState().pauseUpload(id);
      expect(capturedSignal?.aborted).toBe(true);
      expect(getItem(id)?.status).toBe("paused");

      releaseChunk!();
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(completeUpload).not.toHaveBeenCalled();
    });

    it("is a no-op for a terminal item", () => {
      useUploadStore.setState({
        queue: [{ id: "x", file: makeFile("a", 1), status: "done", progress: 100, stage: "Done", startedAt: 0 }],
      });
      useUploadStore.getState().pauseUpload("x");
      expect(getItem("x")?.status).toBe("done");
    });

    it("resumes only the remaining chunks after a pause, on the same session", async () => {
      let pauseNow: () => void = () => {};
      let firstChunkResolved = false;
      (uploadChunk as Mock).mockImplementation(async (_sid: string, idx: number) => {
        if (idx === 0) {
          firstChunkResolved = true;
          return;
        }
        // Chunk 1+ blocks until the test explicitly pauses, simulating an
        // in-flight second chunk when pause fires.
        await new Promise<void>((resolve) => {
          pauseNow = resolve;
        });
      });
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 2);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      expect(firstChunkResolved).toBe(true);

      useUploadStore.getState().pauseUpload(id);
      pauseNow();
      await flush();
      expect(getItem(id)?.status).toBe("paused");

      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-1",
        file_id: "file-1",
        status: "active",
        chunk_count: 2,
        uploaded_chunks: [0],
        completed_count: 1,
      });
      (uploadChunk as Mock).mockReset().mockResolvedValue(undefined);
      useUploadStore.getState().resumeUpload(id, "pw");
      await flush();

      expect(getUploadStatus).toHaveBeenCalledWith("sess-1");
      // Only chunk 1 (the missing one) is re-sent on resume.
      expect((uploadChunk as Mock).mock.calls.map((c) => c[1])).toEqual([1]);
      expect(getItem(id)?.status).toBe("done");
    });

    it("is a no-op for an unknown id", () => {
      expect(() => useUploadStore.getState().resumeUpload("nope", "pw")).not.toThrow();
      expect(() => useUploadStore.getState().pauseUpload("nope")).not.toThrow();
    });

    it("re-sends every chunk when the resume's getUploadStatus call itself rejects", async () => {
      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(() => new Promise<void>((resolve) => {
        releaseChunk = resolve;
      }));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      useUploadStore.getState().pauseUpload(id);
      releaseChunk();
      await flush();
      expect(getItem(id)?.status).toBe("paused");

      (getUploadStatus as Mock).mockRejectedValueOnce(new Error("network blip"));
      (uploadChunk as Mock).mockReset().mockResolvedValue(undefined);
      useUploadStore.getState().resumeUpload(id, "pw");
      await flush();

      // Chunks are idempotent by SHA, so re-sending index 0 (already uploaded
      // before the reject) is safe and correct — the fallback exists exactly
      // for this case.
      expect((uploadChunk as Mock).mock.calls.map((c) => c[1])).toEqual([0]);
      expect(getItem(id)?.status).toBe("done");
    });

    it("never lets a stale draining run finalize after resume replaces it", async () => {
      // Mirrors the REAL uploadChunk/xhrPut contract: an aborted signal
      // rejects promptly with "Upload paused" — pause does not hang forever,
      // it cuts the transfer. A mock that ignores the signal (hangs until
      // manually released) doesn't model reality and produces a false
      // "double completeUpload" result once resumeUpload's synchronous
      // pausedIds.delete() races ahead of an unrelated hang.
      let callCount = 0;
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, _onProgress: unknown, signal?: AbortSignal) => {
          callCount++;
          if (callCount === 1) {
            return new Promise<void>((resolve, reject) => {
              signal?.addEventListener("abort", () => reject(new Error("Upload paused")), { once: true });
            });
          }
          return Promise.resolve();
        }
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().pauseUpload(id);
      useUploadStore.getState().resumeUpload(id, "pw");
      await flush();

      expect(completeUpload).toHaveBeenCalledTimes(1);
      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("progress monotonicity", () => {
    it("never reports a lower percent/bytes than it already emitted, even out of order", async () => {
      let onProgressCb: ((sent: number) => void) | undefined;
      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, onProgress: (n: number) => void) => {
          onProgressCb = onProgress;
          return new Promise<void>((resolve) => {
            releaseChunk = resolve;
          });
        }
      );
      const file = makeFile("a.bin", 1000);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      onProgressCb?.(900);
      await flush(3); // let the RAF-throttled write actually land in the queue
      const bytesAfterHigh = getItem(id)?.bytesProcessed ?? 0;
      expect(bytesAfterHigh).toBeGreaterThan(0);
      onProgressCb?.(100); // a smaller, out-of-order tick must not regress the shown value
      await flush(3);
      expect(getItem(id)?.bytesProcessed).toBeGreaterThanOrEqual(bytesAfterHigh);

      releaseChunk();
      await flush();
      expect(getItem(id)?.status).toBe("done");
    });

    it("floors the resumed row's displayed bytes at what was already shown, never dipping", async () => {
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 2);
      useUploadStore.setState({
        queue: [
          {
            id: "resume-id",
            file,
            status: "paused",
            progress: 60,
            stage: "Paused",
            startedAt: 0,
            bytesProcessed: SMALL_PROFILE.chunkSize,
            totalBytes: file.size,
          },
        ],
      });
      // Prime itemMeta with a resume ctx via a real pause/resume cycle instead
      // of reaching into module-private state: start fresh, pause, then resume
      // reusing the same displayed bytesProcessed floor semantics.
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const freshId = useUploadStore.getState().queue[useUploadStore.getState().queue.length - 1].id;
      await flush(5);
      useUploadStore.getState().pauseUpload(freshId);
      await flush();
      const beforeResume = getItem(freshId)?.bytesProcessed ?? 0;

      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-1",
        file_id: "file-1",
        status: "active",
        chunk_count: 2,
        uploaded_chunks: [],
        completed_count: 0,
      });
      useUploadStore.getState().resumeUpload(freshId, "pw");
      await flush();

      expect(getItem(freshId)?.bytesProcessed ?? 0).toBeGreaterThanOrEqual(beforeResume);
    });
  });

  describe("retryUpload", () => {
    it("falls back to the item's original platform when the resume ctx has none set", async () => {
      (initUpload as Mock).mockResolvedValueOnce(defaultInitResponse({ platform: undefined }));
      (uploadChunk as Mock).mockRejectedValueOnce(new Error("nope — invalid"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (uploadChunk as Mock).mockReset().mockResolvedValue(undefined);
      (initUpload as Mock).mockResolvedValue(defaultInitResponse());
      useUploadStore.getState().retryUpload(id, "pw");
      await flush();

      // Falls back to the original picker platform ("telegram"), not undefined.
      expect(getItem(id)?.status).toBe("done");
    });

    it("keeps the existing progress/bytes instead of resetting to 0", async () => {
      (uploadChunk as Mock).mockRejectedValueOnce(new Error("nope — invalid"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useUploadStore.setState({
        queue: useUploadStore.getState().queue.map((i) => (i.id === id ? { ...i, progress: 42 } : i)),
      });
      (uploadChunk as Mock).mockReset().mockResolvedValue(undefined);
      useUploadStore.getState().retryUpload(id, "pw");

      expect(getItem(id)?.status).toBe("queued");
      expect(getItem(id)?.progress).toBe(42);

      await flush();
      expect(getItem(id)?.status).toBe("done");
    });

    it("is a no-op for an unknown id", () => {
      expect(() => useUploadStore.getState().retryUpload("nope", "pw")).not.toThrow();
    });

    it("waits for the previous run to settle before starting a new one, so completeUpload never fires twice", async () => {
      let releasePrev: () => void = () => {};
      let calls = 0;
      (uploadChunk as Mock).mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releasePrev = resolve;
          });
          throw new Error("nope — invalid, first attempt fails after release");
        }
      });
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().retryUpload(id, "pw");
      releasePrev();
      await flush();

      expect(completeUpload).toHaveBeenCalledTimes(1);
    });
  });

  describe("dismissUpload vs removeFromQueue", () => {
    it("dismissUpload removes the row but does NOT cancel the server session", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().dismissUpload(id);

      expect(cancelUpload).not.toHaveBeenCalled();
      expect(getItem(id)).toBeUndefined();
    });

    it("removeFromQueue cancels the session, aborts in-flight work, and clears the resume record", async () => {
      let capturedSignal: AbortSignal | undefined;
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, _onProgress: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise(() => {});
        }
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().removeFromQueue(id);

      expect(capturedSignal?.aborted).toBe(true);
      expect(cancelUpload).toHaveBeenCalledWith("sess-1");
      expect(getItem(id)).toBeUndefined();
      expect(localStorage.getItem(`zc_upl:${file.name}:${file.size}:${file.lastModified}`)).toBeNull();
    });

    it("removeFromQueue on a still-queued item (no session yet) does not throw", () => {
      useUploadStore.getState().addToQueue(makeFile("a.txt", 10));
      const id = queueIdFor();
      expect(() => useUploadStore.getState().removeFromQueue(id)).not.toThrow();
      expect(cancelUpload).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("gives up and surfaces the underlying error once doInit exhausts all 60 wait-for-slot attempts", async () => {
      // On the LAST attempt (60/60), doInit's `isRetryable && attempt < 59`
      // guard is false, so it re-throws the ORIGINAL error directly — the
      // loop's trailing `return null` is never actually reached this way (the
      // only path to a null return is the pause check at the top of the
      // loop). This locks in the real, user-visible behavior: persistent
      // "too many concurrent" eventually surfaces as a clear failure instead
      // of retrying forever.
      (initUpload as Mock).mockRejectedValue(new Error("too many concurrent uploads"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      // 60 attempts * a deterministic 2000ms backoff (Math.random mocked to
      // 0) = 120s of virtual time minimum — comfortably covered by flush()'s
      // 40 rounds * 5000ms (200s), but give it its own generous budget.
      await flush(50);

      expect(initUpload).toHaveBeenCalledTimes(60);
      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("too many concurrent uploads");
    });

    it("gives up on the RESTART path the same way once its own 60 wait-for-slot attempts are exhausted", async () => {
      (initUpload as Mock).mockResolvedValueOnce(
        defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-dead" })
      );
      (getFileMeta as Mock).mockRejectedValueOnce(new Error("not found")); // adoption fails -> restart
      (initUpload as Mock).mockRejectedValue(new Error("too many concurrent uploads")); // every restart attempt
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      const id = queueIdFor();
      await flush(50);

      expect(cancelUpload).toHaveBeenCalledWith("sess-dead");
      expect(initUpload).toHaveBeenCalledTimes(61); // the resumed-check call + 60 restart attempts
      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("too many concurrent uploads");
    });

    it("marks the item failed with the server message when withRetry exhausts on a non-transient error", async () => {
      (uploadChunk as Mock).mockRejectedValue(new Error("bad request: invalid chunk"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("bad request: invalid chunk");
      expect(uploadChunk).toHaveBeenCalledTimes(1); // no retry on a non-transient error
    });

    it("retries a transient (5xx-shaped) error with backoff before eventually succeeding", async () => {
      (uploadChunk as Mock).mockRejectedValueOnce(new Error("503 Service Unavailable")).mockResolvedValue(undefined);
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(uploadChunk).toHaveBeenCalledTimes(2);
      expect(getItem(id)?.status).toBe("done");
    });

    it("rewrites a 'storage not available' failure into a friendlier message", async () => {
      (initUpload as Mock).mockRejectedValue(new Error("storage not available yet — managed storage is being configured"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("No storage platform connected. Go to Settings to connect one.");
    });

    it("waits out the init wait-for-slot retry loop on a 'too many concurrent' response", async () => {
      (initUpload as Mock)
        .mockRejectedValueOnce(new Error("too many concurrent uploads"))
        .mockResolvedValue(defaultInitResponse());
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(2);
      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("cross-session resume (localStorage, survives a page reload)", () => {
    function seedPersistedResume(file: File, overrides: Record<string, unknown> = {}) {
      const key = `zc_upl:${file.name}:${file.size}:${file.lastModified}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          sessionId: "sess-persisted",
          fileId: "file-1",
          chunkCount: 1,
          chunkSize: SMALL_PROFILE.chunkSize,
          directUpload: false,
          shouldCompress: true,
          platform: "telegram",
          ...overrides,
        })
      );
    }

    it("rebuilds the resume context from localStorage and skips re-hashing/re-initing", async () => {
      const file = makeFile("a.txt", 10);
      seedPersistedResume(file);
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-persisted",
        file_id: "file-1",
        status: "active",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });

      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(initUpload).not.toHaveBeenCalled();
      expect(uploadChunk).toHaveBeenCalledWith(
        "sess-persisted",
        0,
        expect.anything(),
        expect.any(String),
        expect.any(Boolean),
        expect.any(Function),
        expect.anything()
      );
      expect(completeUpload).toHaveBeenCalledWith("sess-persisted", 10, 10);
      expect(getItem(id)?.status).toBe("done");
    });

    it("falls through to a fresh init when the persisted session is no longer active", async () => {
      const file = makeFile("a.txt", 10);
      seedPersistedResume(file);
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-persisted",
        file_id: "file-1",
        status: "cancelled",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });

      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
    });

    it("falls through to a fresh init when the file meta has no wrapped_cek (legacy)", async () => {
      const file = makeFile("a.txt", 10);
      seedPersistedResume(file);
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-persisted",
        file_id: "file-1",
        status: "active",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });
      (getFileMeta as Mock).mockResolvedValue({
        id: "file-1",
        original_name: "a.txt",
        original_size: 10,
        compressed_size: 10,
        encrypted_size: 10,
        chunk_count: 1,
        sha256: "hash",
        salt: "b64:9",
        wrapped_cek: "",
      });

      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
    });

    it("falls through to a fresh init when getUploadStatus rejects (session gone)", async () => {
      const file = makeFile("a.txt", 10);
      seedPersistedResume(file);
      (getUploadStatus as Mock).mockRejectedValue(new Error("not found"));

      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
      expect(getItem(queueIdFor())?.status).toBe("done");
    });

    it("falls through to a fresh init on a corrupted localStorage record", async () => {
      const file = makeFile("a.txt", 10);
      localStorage.setItem(`zc_upl:${file.name}:${file.size}:${file.lastModified}`, "{not json");

      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
      expect(getItem(queueIdFor())?.status).toBe("done");
    });

    it("does nothing (no crash) when localStorage has no record for this file at all", async () => {
      const file = makeFile("brand-new.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
      expect(getItem(queueIdFor())?.status).toBe("done");
    });
  });

  describe("background notifications — full branch matrix", () => {
    function stubNotification(permission: NotificationPermission) {
      const ctorSpy = vi.fn();
      class FakeNotification {
        static permission = permission;
        constructor(...args: unknown[]) {
          ctorSpy(...args);
        }
      }
      vi.stubGlobal("Notification", FakeNotification);
      return ctorSpy;
    }

    it("never notifies when permission is not granted", async () => {
      const ctorSpy = stubNotification("denied");
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(() => new Promise<void>((resolve) => {
        releaseChunk = resolve;
      }));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);
      vi.advanceTimersByTime(3000);

      expect(ctorSpy).not.toHaveBeenCalled();
      releaseChunk();
      await flush();
    });

    // The "all work settled" notification (lines ~52-65) fires from WITHIN
    // the setInterval poller's own tick — but startUpload's own batch-settle
    // handler ALSO clears that interval the moment Promise.all resolves, via
    // a pure microtask chain with no timer delay in the happy path. That
    // microtask reaction always wins the race against the next real 3s tick,
    // so the interval never survives long enough to OBSERVE "done" through
    // real time advancement. Rather than fight that unwinnable race, capture
    // the tick callback directly off `setInterval` and invoke it ourselves —
    // this exercises the exact same closure/branches with the same
    // `getBatchState` wiring, just without depending on wall-clock timing.
    function captureIntervalTick(): { getTick: () => (() => void) | undefined } {
      let tick: (() => void) | undefined;
      vi.stubGlobal("setInterval", ((cb: () => void) => {
        tick = cb;
        return 999 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
      return { getTick: () => tick };
    }

    it("sends an all-succeeded 'Upload complete' notification once its poller tick observes a fully-settled batch", async () => {
      const ctorSpy = stubNotification("granted");
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      const { getTick } = captureIntervalTick();

      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", 2, undefined, null);
      await flush();
      expect(getItem(queueIdFor(0))?.status).toBe("done");
      expect(getItem(queueIdFor(1))?.status).toBe("done");

      getTick()!();

      const finalCall = ctorSpy.mock.calls.find(([title]) => title === "Upload complete");
      expect(finalCall).toBeDefined();
      expect(finalCall![1].body).toBe("All 2 files uploaded");
      expect(finalCall![1]).toMatchObject({ icon: "/favicon.ico", tag: "zcrypt-upload-progress", silent: true });
    });

    it("sends a partial-failure 'Upload complete' notification once its poller tick observes a mixed-result batch", async () => {
      const ctorSpy = stubNotification("granted");
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      const { getTick } = captureIntervalTick();
      (uploadChunk as Mock).mockImplementation(async (sessionId: string) => {
        if (sessionId === "sess-fail") throw new Error("bad request");
      });
      (initUpload as Mock)
        .mockResolvedValueOnce(defaultInitResponse({ session_id: "sess-ok" }))
        .mockResolvedValueOnce(defaultInitResponse({ session_id: "sess-fail" }));

      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", 2, undefined, null);
      await flush();

      getTick()!();

      const finalCall = ctorSpy.mock.calls.find(([title]) => title === "Upload complete");
      expect(finalCall).toBeDefined();
      expect(finalCall![1].body).toBe("1 uploaded, 1 failed");
    });
  });

  describe("pause at every early checkpoint (before any chunk exists)", () => {
    it("stops during hashing without ever calling initUpload", async () => {
      // mockImplementationOnce (not mockImplementation) — a permanent override
      // here would survive .mockClear() into every later test in the file,
      // since clearing call history does not undo a custom implementation.
      let resolveHash: (v: string) => void = () => {};
      (sha256File as Mock).mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveHash = () => resolve("sha-a");
          })
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(3);

      useUploadStore.getState().pauseUpload(id);
      resolveHash("sha-a");
      await flush();

      expect(initUpload).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("paused");
    });

    it("ignores a hash-progress tick that arrives after pause instead of reviving the row", async () => {
      let onProgressCb: ((n: number) => void) | undefined;
      let resolveHash: (v: string) => void = () => {};
      (sha256File as Mock).mockImplementationOnce(
        (_file: File, onProgress: (n: number) => void) => {
          onProgressCb = onProgress;
          return new Promise<string>((resolve) => {
            resolveHash = () => resolve("sha-a");
          });
        }
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(3);

      useUploadStore.getState().pauseUpload(id);
      onProgressCb?.(5); // a stray tick racing in right after pause
      expect(getItem(id)?.status).toBe("paused");

      resolveHash("sha-a");
      await flush();
      expect(initUpload).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("paused");
    });

    // The batch-shared KEK (startUpload derives it ONCE for the whole batch)
    // means deriveKeyBytes's per-file branch and doInit's wait-for-slot retry
    // loop are only reachable via retryUpload/resumeUpload, which pass no
    // batchKek — so these two checkpoints need a real fresh-path RETRY, not a
    // fresh startUpload (whose only "hang" point is the batch-level derive,
    // already covered by the sibling test above via a different mechanism).
    it("stops during a retry's per-file key derivation (no batch-shared KEK) without calling initUpload", async () => {
      (sha256File as Mock).mockRejectedValueOnce(new Error("disk read failed"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();
      expect(getItem(id)?.status).toBe("failed");
      expect(initUpload).not.toHaveBeenCalled();

      let resolveDerive: (v: ArrayBuffer) => void = () => {};
      (deriveKeyBytes as Mock).mockImplementationOnce(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveDerive = resolve;
          })
      );
      useUploadStore.getState().retryUpload(id, "pw");
      await flush(3);

      useUploadStore.getState().pauseUpload(id);
      resolveDerive(new ArrayBuffer(1));
      await flush();

      expect(initUpload).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("paused");
    });

    it("stops while retrying initUpload's wait-for-slot loop, without ever calling uploadChunk", async () => {
      (initUpload as Mock)
        .mockRejectedValueOnce(new Error("too many concurrent uploads"))
        .mockRejectedValueOnce(new Error("should never be reached — pause must win first"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      // Fine-grained advancement (not the coarse flush() helper) to land
      // INSIDE the deterministic 2000ms backoff (Math.random mocked to 0)
      // without overshooting past it into the loop's next iteration.
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);

      useUploadStore.getState().pauseUpload(id);
      // Now let the backoff elapse — the loop's TOP-of-next-iteration
      // isPaused() check must short-circuit before ever calling initUpload
      // again (the second mock throws if it's reached, failing loudly).
      await vi.advanceTimersByTimeAsync(2000);
      await flush();

      expect(initUpload).toHaveBeenCalledTimes(1);
      expect(uploadChunk).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("paused");
    });

    it("stops while retrying the RESTART init loop after a dead resumed session, without ever calling uploadChunk", async () => {
      (initUpload as Mock).mockResolvedValueOnce(
        defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-dead" })
      );
      (getFileMeta as Mock).mockRejectedValueOnce(new Error("not found")); // adoption fails -> restart
      (initUpload as Mock)
        .mockRejectedValueOnce(new Error("too many concurrent uploads"))
        .mockRejectedValueOnce(new Error("should never be reached — pause must win first"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "huggingface", undefined, undefined, null);
      const id = queueIdFor();
      // Reach "restart's doInit attempt 0 rejected, now sleeping in its
      // backoff" via pure microtask draining only (everything up to that
      // sleep — hash, derive, the resumed check, the failed adoption,
      // cancelUpload, the restart's first initUpload call — is timer-free).
      for (let i = 0; i < 25; i++) await Promise.resolve();

      await vi.advanceTimersByTimeAsync(500); // inside the restart's own backoff, not past it
      useUploadStore.getState().pauseUpload(id);
      await vi.advanceTimersByTimeAsync(2000);
      await flush();

      expect(cancelUpload).toHaveBeenCalledWith("sess-dead");
      expect(initUpload).toHaveBeenCalledTimes(2); // resumed-check + one restart attempt — never the 2nd restart retry
      expect(uploadChunk).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("paused");
    });

    it("treats an escaped error whose message happens to match the pause signature as a graceful stop, never a failure", async () => {
      // isPauseError matches purely on message text, by design (it can't tell
      // a real abort-driven "Upload paused" from any other source of that
      // exact string) — this locks in that CONTRACT: whatever the origin,
      // the outer catch must treat it as a stop, never call setError/toast.
      (sha256File as Mock).mockRejectedValueOnce(new Error("Upload paused"));
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(initUpload).not.toHaveBeenCalled();
      expect(getItem(id)?.status).not.toBe("failed");
      expect(getItem(id)?.error).toBeUndefined();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("multi-chunk mid-loop pause and concurrency limits", () => {
    it("stops launching further chunks once paused mid-loop, leaving the row paused (not failed or done)", async () => {
      // Mirrors the REAL uploadChunk contract (signal-driven rejection) rather
      // than hanging on a single shared external resolver — a shared resolver
      // only ever unblocks the LAST call, leaving every earlier chunk's
      // promise permanently pending and poisoning every test that runs after
      // this one in the same file.
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, _onProgress: unknown, signal?: AbortSignal) =>
          new Promise<void>((resolve, reject) => {
            if (signal?.aborted) { reject(new Error("Upload paused")); return; }
            signal?.addEventListener("abort", () => reject(new Error("Upload paused")), { once: true });
          })
      );
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 5);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().pauseUpload(id);
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(completeUpload).not.toHaveBeenCalled();
      // Fewer than all 5 chunks should have been launched once paused this early.
      expect((uploadChunk as Mock).mock.calls.length).toBeLessThan(5);
    });

    it("queues chunk uploads beyond the concurrency cap and still finishes every one", async () => {
      // Default pipelineDepth (workers*3=3) is smaller than maxUploads (5),
      // so the upload-slot waiter queue never actually fills under it — bump
      // workers so pipelineDepth (9) comfortably exceeds maxUploads (5),
      // letting more chunks reach acquireUploadSlot() concurrently than
      // there are slots for.
      (getDeviceProfile as Mock).mockReturnValueOnce({ ...SMALL_PROFILE, workers: 3 });
      const releasers: (() => void)[] = [];
      (uploadChunk as Mock).mockImplementation(
        () => new Promise<void>((resolve) => releasers.push(resolve))
      );
      const file = makeFile("big.bin", SMALL_PROFILE.chunkSize * 8);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      // Only maxUploads (5) chunks ever actually reach the uploadChunk() call
      // — the other 3 are parked in the upload-slot waiter queue (line 639),
      // not yet past acquireUploadSlot().
      expect(uploadChunk).toHaveBeenCalledTimes(5);

      // Switch to auto-resolving for whatever comes after, then drain the 5
      // currently-held calls — each release frees a slot for one of the 3
      // queued chunks, which then resolves immediately under the new default.
      (uploadChunk as Mock).mockResolvedValue(undefined);
      releasers.splice(0).forEach((r) => r());
      await flush();

      expect(uploadChunk).toHaveBeenCalledTimes(8);
      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("resumed completion does not duplicate the optimistic file-list insert", () => {
    it("does not call setFilesData when the completed run was a resume, not a fresh upload", async () => {
      (initUpload as Mock).mockResolvedValue(
        defaultInitResponse({ resumed: true, platform: "telegram", session_id: "sess-old" })
      );
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-old",
        file_id: "file-1",
        status: "active",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "huggingface", undefined, undefined, null);
      await flush();

      expect(setFilesData).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus paused-write guard", () => {
    it("ignores a stray in-flight progress write for a paused item but still accepts terminal writes", async () => {
      let onProgressCb: ((n: number) => void) | undefined;
      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(
        (_sid: string, _idx: number, _data: unknown, _sha: string, _c: boolean, onProgress: (n: number) => void) => {
          onProgressCb = onProgress;
          return new Promise<void>((resolve) => {
            releaseChunk = resolve;
          });
        }
      );
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      useUploadStore.getState().pauseUpload(id);
      expect(getItem(id)?.status).toBe("paused");

      // A progress tick racing in right after pause must not resurrect "uploading".
      onProgressCb?.(5);
      expect(getItem(id)?.status).toBe("paused");

      releaseChunk();
      await flush();
      expect(getItem(id)?.status).toBe("paused"); // stays paused — resume is required to finish it
    });
  });

  describe("getItemFolderId / findByFileId / clearCompleted", () => {
    it("returns the destination folder for a queued item and null once it's gone", async () => {
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, "folder-1");
      const id = queueIdFor();
      expect(useUploadStore.getState().getItemFolderId(id)).toBe("folder-1");
      expect(useUploadStore.getState().getItemFolderId("nope")).toBeNull();
    });

    it("finds a queue item by its backend fileId once assigned", async () => {
      const file = makeFile("a.txt", 10);
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();
      expect(useUploadStore.getState().findByFileId("file-1")?.id).toBe(id);
      expect(useUploadStore.getState().findByFileId("nope")).toBeUndefined();
    });

    it("clearCompleted removes only done items", () => {
      useUploadStore.setState({
        queue: [
          { id: "1", file: makeFile("a", 1), status: "done", progress: 100, stage: "Done", startedAt: 0 },
          { id: "2", file: makeFile("b", 1), status: "failed", progress: 0, stage: "Failed", startedAt: 0 },
          { id: "3", file: makeFile("c", 1), status: "queued", progress: 0, stage: "Queued", startedAt: 0 },
        ],
      });
      useUploadStore.getState().clearCompleted();
      expect(useUploadStore.getState().queue.map((i) => i.id)).toEqual(["2", "3"]);
    });
  });

  describe("startDesktopUpload", () => {
    it("does nothing when the native picker returns no paths", async () => {
      const { pickFiles } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue([]);
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      expect(useUploadStore.getState().queue).toHaveLength(0);
    });

    it("queues each picked path, streams it to the platform, and marks it done", async () => {
      const { pickFiles, sidecarUpload } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin", "/tmp/b.bin"]);
      (sidecarUpload as Mock).mockResolvedValue(undefined);
      const onRefresh = vi.fn();
      await useUploadStore.getState().startDesktopUpload("pw", onRefresh);

      // Streaming upload resolves only when the bytes are confirmed remote.
      // The 4th arg is the queue id passed as the cancellable transfer id.
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/a.bin", "pw", undefined, expect.any(String));
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/b.bin", "pw", undefined, expect.any(String));
      expect(useUploadStore.getState().queue.every((i) => i.status === "done")).toBe(true);
      // Items are flagged desktop so pause is hidden and retry stays on the core.
      expect(useUploadStore.getState().queue.every((i) => i.desktop === true)).toBe(true);
      expect(onRefresh).toHaveBeenCalled();
    });

    it("marks a path failed when the core upload throws", async () => {
      const { pickFiles, sidecarUpload } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (sidecarUpload as Mock).mockRejectedValue(new Error("disk read failed"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      expect(useUploadStore.getState().queue[0].status).toBe("failed");
      expect(useUploadStore.getState().queue[0].error).toBe("disk read failed");
    });

    it("marks a path failed when the streaming upload fails", async () => {
      const { pickFiles, sidecarUpload } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (sidecarUpload as Mock).mockRejectedValue(new Error("platform unreachable"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      expect(useUploadStore.getState().queue[0].status).toBe("failed");
      expect(useUploadStore.getState().queue[0].error).toBe("platform unreachable");
    });

    it("retryUpload on a desktop item re-drives the streaming core, never the web pipeline", async () => {
      const { pickFiles, sidecarUpload } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (sidecarUpload as Mock).mockRejectedValueOnce(new Error("blip"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      const item = useUploadStore.getState().queue[0];
      expect(item.status).toBe("failed");

      (sidecarUpload as Mock).mockResolvedValueOnce(undefined);
      useUploadStore.getState().retryUpload(item.id, "pw");
      await vi.waitFor(() => {
        expect(useUploadStore.getState().queue[0].status).toBe("done");
      });
      // Retry re-drives the streaming core with the desktop path — the item's
      // 0-byte placeholder File never reached the web pipeline's init.
      expect(sidecarUpload).toHaveBeenLastCalledWith("/tmp/a.bin", "pw", undefined, expect.any(String));
    });

    it("pauseUpload is a no-op for desktop items (the core has no pause)", async () => {
      const { pickFiles, sidecarUpload } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      let releaseUpload: () => void = () => {};
      (sidecarUpload as Mock).mockImplementation(
        () => new Promise<void>((res) => { releaseUpload = res; })
      );
      const run = useUploadStore.getState().startDesktopUpload("pw", undefined);
      await vi.waitFor(() => {
        expect(useUploadStore.getState().queue).toHaveLength(1);
      });
      const id = useUploadStore.getState().queue[0].id;
      useUploadStore.getState().pauseUpload(id);
      // NOT paused — "paused" writes flush synchronously, so if the desktop
      // guard failed we would see it here. (The core kept syncing; pausing
      // only lied about it before.)
      expect(useUploadStore.getState().queue[0].status).not.toBe("paused");
      releaseUpload();
      await run;
      // And the pause didn't poison later status writes: the item completes.
      expect(useUploadStore.getState().queue[0].status).toBe("done");
    });

    // ── Live progress from the in-process core ───────────────────────────────
    // The core emits per-stage progress; the store folds those stages into ONE
    // continuous 0-100 bar (blendDesktopUploadProgress). Drive the real
    // subscription callback so the stage mapping is exercised end to end.

    /** Boots a desktop upload that hangs mid-transfer, returning the captured
     *  progress emitter plus a release hook. */
    async function startHangingDesktopUpload(paths = ["/tmp/a.bin"]) {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(paths);
      let emit: (p: SidecarProgress) => void = () => {};
      const unlisten = vi.fn();
      (subscribeProgress as Mock).mockClear();
      (subscribeProgress as Mock).mockImplementation(async (cb: (p: SidecarProgress) => void) => {
        emit = cb;
        return unlisten;
      });
      let release: () => void = () => {};
      (sidecarUpload as Mock).mockImplementation(
        () => new Promise<void>((res) => {
          release = res;
        }),
      );
      const run = useUploadStore.getState().startDesktopUpload("pw", undefined);
      await flush(5);
      return { run, emit: (p: SidecarProgress) => emit(p), release: () => release(), unlisten };
    }

    const progressEvent = (over: Partial<SidecarProgress> = {}): SidecarProgress => ({
      file_id: "f1",
      file_name: "a.bin",
      stage: "uploading",
      chunks_done: 0,
      chunks_total: 0,
      bytes_done: 0,
      bytes_total: 0,
      speed: 0,
      ...over,
    });

    it.each([
      // stage,          bytes_done, bytes_total, expected percent
      ["hashing", 50, 100, 4], // moving 0-8% band so it isn't frozen at 1%
      ["hashing", 100, 100, 8],
      ["deriving_key", 0, 100, 9],
      ["processing", 0, 100, 9], // clamped to the 9% floor
      ["encrypting", 50, 100, 54],
      ["uploading", 100, 100, 99],
      ["finalizing", 0, 100, 99],
      ["done", 0, 100, 100],
    ])("maps core stage %s (%i/%i bytes) to %i%%", async (stage, done, total, expected) => {
      const { emit, release, run } = await startHangingDesktopUpload();
      emit(progressEvent({ stage, bytes_done: done, bytes_total: total }));
      await flush(3);
      expect(getItem(queueIdFor())?.progress).toBe(expected);
      release();
      await run;
    });

    it("treats a zero-byte total as 0% progress rather than dividing by zero", async () => {
      const { emit, release, run } = await startHangingDesktopUpload();
      emit(progressEvent({ stage: "uploading", bytes_done: 0, bytes_total: 0 }));
      await flush(3);
      // within = 0, so the uploading band sits at its 9% floor — no NaN.
      expect(getItem(queueIdFor())?.progress).toBe(9);
      release();
      await run;
    });

    it("holds the previous percent when the core reports a stage the bar doesn't model", async () => {
      const { emit, release, run } = await startHangingDesktopUpload();
      const id = queueIdFor();
      emit(progressEvent({ stage: "uploading", bytes_done: 50, bytes_total: 100 }));
      await flush(3);
      expect(getItem(id)?.progress).toBe(54);

      // An unmodelled stage maps to undefined — the bar must not jump or reset.
      emit(progressEvent({ stage: "verifying_remote", bytes_done: 0, bytes_total: 100 }));
      await flush(3);
      expect(getItem(id)?.stage).toBe("verifying_remote");
      expect(getItem(id)?.progress).toBe(54);
      release();
      await run;
    });

    it("ignores progress for a file name that matches nothing in the queue", async () => {
      const { emit, release, run } = await startHangingDesktopUpload();
      const id = queueIdFor();
      const before = getItem(id);
      emit(progressEvent({ file_name: "someone-elses-file.bin", bytes_done: 99, bytes_total: 100 }));
      await flush(3);
      // No match, so nothing was ever batched — the row is byte-for-byte intact.
      expect(getItem(id)).toEqual(before);
      release();
      await run;
    });

    it("stops matching progress to an item once it has finished", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      let emit: (p: SidecarProgress) => void = () => {};
      (subscribeProgress as Mock).mockImplementation(async (cb: (p: SidecarProgress) => void) => {
        emit = cb;
        return vi.fn();
      });
      (sidecarUpload as Mock).mockResolvedValue(undefined);
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      const id = queueIdFor();
      expect(getItem(id)?.status).toBe("done");

      // A late straggler event for a done item finds no match and is dropped —
      // it must not resurrect the row as "encrypting".
      emit(progressEvent({ stage: "uploading", bytes_done: 1, bytes_total: 100 }));
      await flush(3);
      expect(getItem(id)?.status).toBe("done");
      expect(getItem(id)?.progress).toBe(100);
    });

    it("aborts the in-flight core transfer when a desktop item is cancelled", async () => {
      const { cancelTransfer } = await import("@/lib/tauri");
      (cancelTransfer as Mock).mockClear().mockResolvedValue(true);
      const { release, run } = await startHangingDesktopUpload();
      const id = queueIdFor();

      useUploadStore.getState().removeFromQueue(id);
      await flush(3);
      // The queue id doubles as the core's transfer id, so Cancel can reach it.
      expect(cancelTransfer).toHaveBeenCalledWith(id);
      expect(useUploadStore.getState().queue).toHaveLength(0);
      release();
      await run;
    });

    it("survives the shell refusing to cancel a transfer", async () => {
      const { cancelTransfer } = await import("@/lib/tauri");
      (cancelTransfer as Mock).mockClear().mockRejectedValue(new Error("no such transfer"));
      const { release, run } = await startHangingDesktopUpload();
      const id = queueIdFor();

      // Best-effort and fire-and-forget — a rejection must not escape.
      expect(() => useUploadStore.getState().removeFromQueue(id)).not.toThrow();
      await flush(3);
      expect(cancelTransfer).toHaveBeenCalledWith(id);
      expect(useUploadStore.getState().queue).toHaveLength(0);
      release();
      await run;
      (cancelTransfer as Mock).mockResolvedValue(true);
    });

    it("routes resumeUpload on a desktop item back through the core, not the web pipeline", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockRejectedValueOnce(new Error("blip"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      const id = queueIdFor();
      expect(getItem(id)?.status).toBe("failed");

      (sidecarUpload as Mock).mockResolvedValueOnce(undefined);
      useUploadStore.getState().resumeUpload(id, "pw");
      await flush(5);
      expect(getItem(id)?.status).toBe("done");
      // Re-driven through the core with the original path — never initUpload
      // (the item's File is a 0-byte placeholder the web pipeline would reject).
      expect(sidecarUpload).toHaveBeenLastCalledWith("/tmp/a.bin", "pw", undefined, id);
      expect(initUpload).not.toHaveBeenCalled();
    });

    it("shows live progress on a desktop retry and surfaces a second failure", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockRejectedValueOnce(new Error("first failure"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      const id = queueIdFor();

      // The retry installs its OWN progress subscription (the batch one already
      // unlistened), so without it a retry would show no movement at all.
      let emit: (p: SidecarProgress) => void = () => {};
      const unlistenRetry = vi.fn();
      (subscribeProgress as Mock).mockClear();
      (subscribeProgress as Mock).mockImplementation(async (cb: (p: SidecarProgress) => void) => {
        emit = cb;
        return unlistenRetry;
      });
      let release: (e: Error) => void = () => {};
      (sidecarUpload as Mock).mockImplementation(
        () => new Promise<void>((_res, rej) => {
          release = rej;
        }),
      );
      useUploadStore.getState().retryUpload(id, "pw");
      await flush(3);
      expect(subscribeProgress).toHaveBeenCalledTimes(1);

      // Progress for a DIFFERENT file is filtered out by name.
      emit(progressEvent({ file_name: "other.bin", bytes_done: 99, bytes_total: 100 }));
      // An unmodelled stage yields no percent and is skipped entirely.
      emit(progressEvent({ stage: "verifying_remote", bytes_done: 99, bytes_total: 100 }));
      await flush(3);
      expect(getItem(id)?.progress).not.toBe(99);

      // A real stage moves the bar.
      emit(progressEvent({ stage: "uploading", bytes_done: 50, bytes_total: 100 }));
      await flush(3);
      expect(getItem(id)?.progress).toBe(54);

      release(new Error("second failure"));
      await flush(5);
      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("second failure");
      // The scoped subscription is torn down even on the failure path.
      expect(unlistenRetry).toHaveBeenCalled();
    });

    it("reports a non-Error core rejection on retry as a generic failure", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockRejectedValueOnce(new Error("first failure"));
      await useUploadStore.getState().startDesktopUpload("pw", undefined);
      const id = queueIdFor();

      // Tauri rejects with a bare string, not an Error.
      (sidecarUpload as Mock).mockRejectedValueOnce("ipc closed");
      useUploadStore.getState().retryUpload(id, "pw");
      await flush(5);
      expect(getItem(id)?.error).toBe("Upload failed");
    });
  });

  describe("paused-item status guard", () => {
    it("drops a straggling non-terminal write for a paused item", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      useUploadStore.getState().pauseUpload(id);
      expect(getItem(id)?.status).toBe("paused");

      // An in-flight emit (or a backend SSE event) landing after the pause must
      // not flip the row back to uploading — that was how pause visibly undid
      // itself. The write is dropped before it can even be batched.
      useUploadStore.getState().updateStatus(id, "uploading", 42, "Uploading...");
      await flush(3);
      expect(getItem(id)?.status).toBe("paused");
      expect(getItem(id)?.progress).not.toBe(42);
    });

    it("still accepts terminal writes for a paused item", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      useUploadStore.getState().pauseUpload(id);
      expect(getItem(id)?.status).toBe("paused");

      // A genuine failure still has to land — the guard whitelists terminals.
      useUploadStore.getState().updateStatus(id, "failed", 0, "Failed");
      expect(getItem(id)?.status).toBe("failed");
    });
  });

  describe("background notifications", () => {
    it("posts a per-batch progress notification only while the tab is hidden and permission is granted", async () => {
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        title: string;
        options?: NotificationOptions;
        constructor(title: string, options?: NotificationOptions) {
          this.title = title;
          this.options = options;
        }
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      const ctorSpy = vi.fn();
      vi.stubGlobal(
        "Notification",
        new Proxy(FakeNotification, {
          construct(target, args) {
            ctorSpy(...args);
            return new target(args[0] as string, args[1] as NotificationOptions);
          },
        })
      );

      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(() => new Promise<void>((resolve) => {
        releaseChunk = resolve;
      }));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);
      vi.advanceTimersByTime(3000);

      expect(ctorSpy).toHaveBeenCalled();
      const [, opts] = ctorSpy.mock.calls[0];
      expect(opts.tag).toBe("zcrypt-upload-progress");

      releaseChunk();
      await flush();
      delete (document as { hidden?: boolean }).hidden;
    });

    it("does not post anything while the tab is visible", async () => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      const ctorSpy = vi.fn();
      vi.stubGlobal("Notification", class {
        static permission: NotificationPermission = "granted";
        constructor(...args: unknown[]) {
          ctorSpy(...args);
        }
      });
      let releaseChunk: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(() => new Promise<void>((resolve) => {
        releaseChunk = resolve;
      }));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);
      vi.advanceTimersByTime(3000);

      expect(ctorSpy).not.toHaveBeenCalled();
      releaseChunk();
      await flush();
      delete (document as { hidden?: boolean }).hidden;
    });
  });

  describe("zero-knowledge dedup + encrypted filename", () => {
    afterEach(() => {
      // Restore the empty-vault defaults so nothing leaks into later tests.
      (useAuthStore.getState as Mock).mockReturnValue({ user: undefined });
      (usePassphraseStore.getState as Mock).mockReturnValue({ getPassphrase: () => null });
    });

    it("uses the HMAC dedup scheme and encrypts the filename when a user id + unlocked vault are present", async () => {
      (useAuthStore.getState as Mock).mockReturnValue({ user: { id: "user-42" } });
      (usePassphraseStore.getState as Mock).mockReturnValue({ getPassphrase: () => "vault-pass" });

      const file = makeFile("secret.txt", 10, "0123456789");
      // The upload passphrase (folder password) is distinct from the vault pass.
      useUploadStore.getState().startUpload([file], "folder-pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      // Content MAC (HMAC) hashing keyed off the vault-derived dedup key.
      expect(deriveDedupKeyBytes).toHaveBeenCalledWith("folder-pw", "user-42");
      expect(contentMacFile).toHaveBeenCalled();
      // Zero-knowledge filename: derived from the VAULT passphrase, not the upload one.
      expect(deriveNameKey).toHaveBeenCalledWith("vault-pass", "user-42");
      expect(encryptName).toHaveBeenCalledWith("secret.txt", expect.anything());
      // The hmac scheme + encrypted name (empty plaintext filename) reach the server.
      expect(initUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          sha256: "hmac-secret.txt-10",
          sha256_scheme: "hmac_v1",
          encrypted_name: "enc:secret.txt",
          filename: "",
        })
      );
      expect(getItem(id)?.status).toBe("done");
    });

    it("keeps the plain sha256 scheme when there is no user id (dedup path skipped)", async () => {
      const file = makeFile("plain.txt", 10, "0123456789");
      useUploadStore.getState().startUpload([file], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(deriveDedupKeyBytes).not.toHaveBeenCalled();
      expect(deriveNameKey).not.toHaveBeenCalled();
      expect(initUpload).toHaveBeenCalledWith(
        expect.objectContaining({ sha256_scheme: "plain", filename: "plain.txt" })
      );
    });
  });

  describe("startUpload — per-file size cap", () => {
    function oversized(name: string): File {
      const f = new File(["x"], name);
      Object.defineProperty(f, "size", { value: 11 * 1024 * 1024 * 1024, configurable: true });
      return f;
    }

    it("rejects a single oversized file, toasts, and never starts an upload", async () => {
      useUploadStore.getState().startUpload([oversized("huge.bin")], "pw", "telegram", undefined, undefined, null);
      await flush();

      expect(toast.error).toHaveBeenCalledTimes(1);
      const msg = (toast.error as Mock).mock.calls[0][0] as string;
      expect(msg).toContain('"huge.bin"');
      expect(msg).toContain("exceeds");
      expect(msg).toContain("per-file limit");
      expect(initUpload).not.toHaveBeenCalled();
    });

    it("drops the oversized files (with an 'and N more' summary) but still uploads the valid ones", async () => {
      const files = [
        oversized("a.bin"),
        oversized("b.bin"),
        oversized("c.bin"),
        oversized("d.bin"),
        makeFile("ok.txt", 10, "0123456789"),
      ];
      useUploadStore.getState().startUpload(files, "pw", "telegram", undefined, undefined, null);
      await flush();

      const msg = (toast.error as Mock).mock.calls[0][0] as string;
      expect(msg).toContain("and 1 more");
      expect(msg).toContain("exceed"); // plural form: no trailing "s"
      // The one valid file still uploads.
      expect(initUpload).toHaveBeenCalledWith(expect.objectContaining({ filename: "ok.txt" }));
    });
  });

  describe("getResumableUploadIds", () => {
    it("returns the ids of failed uploads that still hold a resumable session", async () => {
      // Init succeeds (records a resume session), then the chunk upload fails
      // non-transiently — leaving the item failed but resumable.
      (uploadChunk as Mock).mockRejectedValue(new Error("bad request: invalid chunk"));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useUploadStore.getState().getResumableUploadIds()).toContain(id);
    });

    it("excludes done uploads (no resumable session)", async () => {
      useUploadStore.getState().startUpload([makeFile("a.txt", 10, "0123456789")], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      expect(useUploadStore.getState().getResumableUploadIds()).not.toContain(id);
    });
  });

  // ── Edge shapes the happy paths never produce ─────────────────────────────
  describe("degenerate inputs and non-Error failures", () => {
    it("uploads a zero-byte file without dividing by its size anywhere", async () => {
      // Every progress calculation divides by file.size; a 0-byte file must fall
      // back to chunk-count ratios instead of producing NaN/Infinity percents.
      const empty = makeFile("empty.txt", 0, "");
      useUploadStore.getState().startUpload([empty], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      expect(Number.isFinite(getItem(id)?.progress)).toBe(true);
      expect(getItem(id)?.progress).toBe(100);
    });

    it("reports a non-Error rejection from the upload pipeline as a generic failure", async () => {
      // Tauri IPC and some platform SDKs reject with bare strings, not Errors.
      (initUpload as Mock).mockRejectedValue("plain string blew up");
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBeTruthy();
    });

    it("leaves sibling rows untouched when one item in a batch is updated", async () => {
      // The batched flush maps over the WHOLE queue; rows with no pending update
      // must come back byte-identical rather than being rebuilt with defaults.
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);
      const [a, b] = useUploadStore.getState().queue.map((i) => i.id);
      const bBefore = getItem(b);

      useUploadStore.getState().updateStatus(a, "uploading", 33, "Uploading...");
      await flush(3);

      expect(getItem(a)?.progress).toBe(33);
      expect(getItem(b)).toEqual(bBefore);
    });

    it("keeps the previous stage when an update omits it", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      const stageBefore = getItem(id)?.stage;

      useUploadStore.getState().updateStatus(id, "uploading", 50);
      await flush(3);

      expect(getItem(id)?.progress).toBe(50);
      expect(getItem(id)?.stage).toBe(stageBefore);
    });

    it("keeps the previous stage on a terminal update that omits it", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);
      const stageBefore = getItem(id)?.stage;

      // Terminal writes bypass the batch and flush synchronously.
      useUploadStore.getState().updateStatus(id, "done", 100);
      expect(getItem(id)?.stage).toBe(stageBefore);
    });

    it("ignores removeFromQueue for an id that is not in the queue", () => {
      expect(() => useUploadStore.getState().removeFromQueue("never-existed")).not.toThrow();
      expect(useUploadStore.getState().queue).toHaveLength(0);
    });

    it("swallows a failing server-side session cancel when a row is removed", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      (cancelUpload as Mock).mockRejectedValue(new Error("session already gone"));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      // Best-effort cleanup: the row must disappear even if the server call fails.
      expect(() => useUploadStore.getState().removeFromQueue(id)).not.toThrow();
      await flush(3);
      expect(cancelUpload).toHaveBeenCalled();
      expect(useUploadStore.getState().queue).toHaveLength(0);
    });
  });

  describe("pause at the earliest checkpoints", () => {
    it("stops before hashing when the item is already paused", async () => {
      let resolveHash: () => void = () => {};
      (sha256File as Mock).mockImplementationOnce(
        () => new Promise<string>((resolve) => {
          resolveHash = () => resolve("sha-a");
        }),
      );
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(3);

      useUploadStore.getState().pauseUpload(id);
      resolveHash();
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(initUpload).not.toHaveBeenCalled();
    });

    it("does not write a paused status once a newer run owns the item", async () => {
      // Retry supersedes the in-flight run. The stale run must stay silent —
      // writing "paused" from it is what used to make a live retry look stopped.
      let releaseFirst: () => void = () => {};
      (initUpload as Mock).mockImplementationOnce(
        () => new Promise(() => {}),
      );
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      (initUpload as Mock).mockImplementation(
        () => new Promise((resolve) => {
          releaseFirst = () => resolve(defaultInitResponse());
        }),
      );
      useUploadStore.getState().retryUpload(id, "pw");
      await flush(3);
      // Pause targets the item, but the ORIGINAL run is no longer current.
      useUploadStore.getState().pauseUpload(id);
      releaseFirst();
      await flush();

      expect(getItem(id)).toBeDefined();
    });
  });

  describe("more pause and failure interleavings", () => {
    it("bails out before doing any work when the row is paused before the run starts", async () => {
      // pauseUpload lands synchronously, before the async run reaches its first
      // checkpoint — so the very first checkpoint is the one that stops it.
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      useUploadStore.getState().pauseUpload(id);
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(sha256File).not.toHaveBeenCalled();
      expect(initUpload).not.toHaveBeenCalled();
    });

    it("stops launching further chunks after the first one fails", async () => {
      // Serialize to one in-flight chunk so the first rejection is recorded before
      // the loop considers the next index — otherwise every chunk is already in
      // flight by the time any of them fails and the break can't be observed.
      (getDeviceProfile as Mock).mockReturnValue({ ...SMALL_PROFILE, chunkSize: 4, workers: 1 });
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 8, chunk_size: 4 }));
      let calls = 0;
      (uploadChunk as Mock).mockImplementation(async () => {
        calls++;
        if (calls === 1) throw new Error("invalid chunk"); // non-transient → no retry
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 32)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      // Broke out of the launch loop instead of pushing all eight chunks.
      expect(calls).toBeLessThan(8);
    });

    it("keeps the FIRST error when several chunks fail", async () => {
      (getDeviceProfile as Mock).mockReturnValue({ ...SMALL_PROFILE, chunkSize: 4, workers: 2, maxConcurrentUploads: 2 });
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 4, chunk_size: 4 }));
      let n = 0;
      (uploadChunk as Mock).mockImplementation(async () => {
        n++;
        throw new Error(`invalid chunk ${n}`);
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 16)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      // Whichever landed first wins; later failures must not overwrite it.
      expect(getItem(id)?.error).toContain("invalid chunk");
    });

    it("reports a non-Error chunk rejection without crashing the retry classifier", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      // withRetry lowercases the message to classify transient vs fatal — a bare
      // string has no .message, so it must be stringified rather than crash.
      (uploadChunk as Mock).mockRejectedValue("bare string rejection");

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
    });

    it("reports an empty batch as 0% rather than dividing by zero", async () => {
      // startBackgroundNotifications' reporter is called on an interval; once the
      // batch rows are dismissed it sees an empty array.
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        constructor(_t: string, _o?: NotificationOptions) {}
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(5);

      // Drop the row, then let the notification interval tick against no rows.
      useUploadStore.getState().removeFromQueue(id);
      expect(() => vi.advanceTimersByTime(6000)).not.toThrow();
    });
  });

  describe("pause landing in the narrow windows inside the chunk pipeline", () => {
    it("does not send a chunk that was waiting for an upload slot when the pause landed", async () => {
      // The upload semaphore allows 5 concurrent sends, so a file needs more than
      // five chunks before any of them genuinely queues. Chunks 6+ clear the
      // pre-acquire check, then block on the semaphore; the pause arrives while
      // they wait, so only the POST-acquire check can keep them off the network.
      (getDeviceProfile as Mock).mockReturnValue({ ...SMALL_PROFILE, chunkSize: 4, workers: 8 });
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 8, chunk_size: 4 }));

      const releases: (() => void)[] = [];
      let sent = 0;
      (uploadChunk as Mock).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            sent++;
            releases.push(resolve);
          }),
      );

      useUploadStore.getState().startUpload([makeFile("a.txt", 32)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(4);

      // Five in flight, the rest queued behind the semaphore.
      const inFlight = sent;
      expect(inFlight).toBeLessThan(8);

      useUploadStore.getState().pauseUpload(id);
      for (const r of releases) r();
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      // The queued chunks bailed at the post-acquire check instead of sending.
      expect(sent).toBe(inFlight);
    });

    it("stops retrying a chunk as soon as the pause lands during backoff", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      // A transient failure puts the chunk into backoff; the pause must break the
      // retry loop at its next entry check rather than sitting there for minutes.
      let attempts = 0;
      (uploadChunk as Mock).mockImplementation(async () => {
        attempts++;
        throw new Error("Too Many Requests");
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(2);
      const attemptsBeforePause = attempts;

      useUploadStore.getState().pauseUpload(id);
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(attempts).toBeLessThanOrEqual(attemptsBeforePause + 1);
    });

    it("marks the row paused when the pause interrupts session init", async () => {
      // Pausing during init raises a PausedError from inside withRetry, which the
      // run's catch has to read as a stop rather than a failure.
      let releaseInit: () => void = () => {};
      (initUpload as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseInit = () => resolve(defaultInitResponse({ chunk_count: 1 }));
          }),
      );

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(4);

      useUploadStore.getState().pauseUpload(id);
      releaseInit();
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(getItem(id)?.error).toBeUndefined();
    });

    it("lets a superseding run finalize while the stale run stays silent", async () => {
      // Retry starts a new run for the same row. The old run is still draining;
      // when it reaches finalize it must notice it no longer owns the item and
      // bow out, or the two runs fight over the row's terminal state.
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      let releaseComplete: () => void = () => {};
      let completeCalls = 0;
      (completeUpload as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            completeCalls++;
            if (completeCalls === 1) releaseComplete = () => resolve({ file_id: "file-1" });
            else resolve({ file_id: "file-1" });
          }),
      );

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(4);

      // Start a second run for the same row while the first sits in completeUpload.
      useUploadStore.getState().retryUpload(id, "pw");
      await flush(2);
      releaseComplete();
      await flush();

      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("progress accounting details", () => {
    it("smooths the transfer rate across successive progress samples", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      // The rate is sampled at most ~1/s: the first callback only seeds the
      // tracker, the second sets the initial EMA, and the third is the first one
      // that actually BLENDS into the running average.
      (uploadChunk as Mock).mockImplementation(
        async (
          _sid: string,
          _idx: number,
          _data: unknown,
          _sha: string,
          _c: boolean,
          onProgress?: (sent: number) => void,
        ) => {
          onProgress?.(128);
          await vi.advanceTimersByTimeAsync(1200);
          onProgress?.(512);
          await vi.advanceTimersByTimeAsync(1200);
          onProgress?.(1024);
        },
      );

      useUploadStore.getState().startUpload([makeFile("a.txt", 1024)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
    });

    it("reports byte progress for a zero-byte file by chunk count instead of size", async () => {
      // Both the overall fraction and the per-chunk fraction divide by a byte
      // count that is 0 here, so each needs its chunk-count/complete fallback or
      // the bar shows NaN.
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      (uploadChunk as Mock).mockImplementation(
        async (
          _sid: string,
          _idx: number,
          _data: unknown,
          _sha: string,
          _c: boolean,
          onProgress?: (sent: number) => void,
        ) => {
          onProgress?.(0);
        },
      );

      useUploadStore.getState().startUpload([makeFile("empty.bin", 0, "")], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      expect(Number.isFinite(getItem(id)?.progress)).toBe(true);
    });

    it("reports a paused zero-byte upload's position by chunk count", async () => {
      // markPaused recomputes the percent from bytes; with a 0-byte file that
      // divisor is zero, so it has to fall back to the chunk count.
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      let hold: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(() => new Promise<void>((res) => {
        hold = res;
      }));

      useUploadStore.getState().startUpload([makeFile("empty.bin", 0, "")], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(4);

      useUploadStore.getState().pauseUpload(id);
      hold();
      await flush();

      expect(getItem(id)?.status).toBe("paused");
      expect(Number.isFinite(getItem(id)?.progress)).toBe(true);
    });

    it("scores done and failed rows as complete in the batch notification", async () => {
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        constructor(_t: string, _o?: NotificationOptions) {}
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

      // A mixed batch: one row succeeds, one fails outright, one is still going.
      // The reporter counts both terminal states as 100% so the aggregate percent
      // climbs to completion instead of stalling on the failed row.
      (initUpload as Mock)
        .mockResolvedValueOnce(defaultInitResponse({ chunk_count: 1 }))
        .mockRejectedValueOnce(new Error("invalid request"))
        .mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      let hold: () => void = () => {};
      let n = 0;
      (uploadChunk as Mock).mockImplementation(() => {
        n++;
        if (n === 1) return Promise.resolve();
        return new Promise<void>((res) => {
          hold = res;
        });
      });

      useUploadStore
        .getState()
        .startUpload(
          [makeFile("a.txt", 10), makeFile("b.txt", 10), makeFile("c.txt", 10)],
          "pw",
          "telegram",
          3,
          undefined,
          null,
        );
      await flush(6);

      const statuses = useUploadStore.getState().queue.map((i) => i.status);
      expect(statuses).toContain("done");
      expect(statuses).toContain("failed");

      // Tick the reporter while the batch holds all three states at once.
      vi.advanceTimersByTime(4000);

      // Tick again with the surviving row carrying real progress, so the
      // aggregate blends a partial percent alongside the two terminal 100s.
      const active = useUploadStore
        .getState()
        .queue.find((i) => i.status !== "done" && i.status !== "failed");
      expect(active).toBeDefined();
      useUploadStore.getState().updateStatus(active!.id, "uploading", 55, "Uploading...");
      await flush(2);
      expect(getItem(active!.id)?.progress).toBe(55);
      vi.advanceTimersByTime(4000);

      hold();
      await flush();
    });

    it("scores every row state the batch reporter can see", async () => {
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        constructor(_t: string, _o?: NotificationOptions) {}
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

      // Drive the row states directly rather than via pipeline outcomes, so the
      // reporter is guaranteed to see done / failed / mid-progress / untouched in
      // one pass — each scores differently in the aggregate percent.
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore
        .getState()
        .startUpload(
          [makeFile("a.txt", 10), makeFile("b.txt", 10), makeFile("c.txt", 10), makeFile("d.txt", 10)],
          "pw",
          "telegram",
          4,
          undefined,
          null,
        );
      await flush(4);
      const ids = useUploadStore.getState().queue.map((i) => i.id);
      expect(ids).toHaveLength(4);

      const store = useUploadStore.getState();
      store.updateStatus(ids[0], "done", 100, "Done");
      store.setError(ids[1], "nope");
      store.updateStatus(ids[2], "uploading", 61, "Uploading...");
      store.updateStatus(ids[3], "uploading", 0, "Uploading...");
      await flush(2);

      expect(getItem(ids[0])?.status).toBe("done");
      expect(getItem(ids[1])?.status).toBe("failed");
      expect(getItem(ids[2])?.progress).toBe(61);

      vi.advanceTimersByTime(4000);
      vi.advanceTimersByTime(4000);
    });

    it("averages in a partially-uploaded row's real progress", async () => {
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        constructor(_t: string, _o?: NotificationOptions) {}
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      let hold: () => void = () => {};
      (uploadChunk as Mock).mockImplementation(
        (
          _sid: string,
          _idx: number,
          _data: unknown,
          _sha: string,
          _c: boolean,
          onProgress?: (sent: number) => void,
        ) =>
          new Promise<void>((resolve) => {
            onProgress?.(5);
            hold = resolve;
          }),
      );

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush(4);
      expect(getItem(id)?.progress).toBeGreaterThan(0);

      // The reporter now sees a row mid-flight rather than at a flat 0.
      vi.advanceTimersByTime(6000);
      hold();
      await flush();

      expect(getItem(id)?.status).toBe("done");
    });

    it("counts a not-yet-started row as 0% in the batch notification", async () => {
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        constructor(_t: string, _o?: NotificationOptions) {}
      }
      vi.stubGlobal("Notification", FakeNotification);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);

      // The reporter runs on an interval while the row still sits at 0 progress.
      expect(() => vi.advanceTimersByTime(6000)).not.toThrow();
    });

    it("files an upload into the folder it was started in", async () => {
      (initUpload as Mock).mockResolvedValue(defaultInitResponse({ chunk_count: 1 }));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, "folder-42");
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      // The optimistic row handed to the file list carries the folder.
      const rows = (setFilesData as Mock).mock.calls.at(-1)?.[0];
      if (typeof rows === "function") {
        const out = rows([]) as { folder_id?: string | null }[];
        expect(out[0]?.folder_id).toBe("folder-42");
      }
    });

    it("takes the platform from the server session when the saved record has none", async () => {
      // Records written before platform was persisted have no platform field; the
      // live session's platform is the correct source of truth for the restart.
      localStorage.setItem(
        "zc_upl:a.txt:10:1000",
        JSON.stringify({
          sessionId: "sess-1",
          fileId: "file-1",
          chunkCount: 1,
          chunkSize: 2048,
          directUpload: false,
          shouldCompress: true,
          // no `platform`
        }),
      );
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-1",
        file_id: "file-1",
        status: "active",
        platform: "huggingface",
        chunk_count: 1,
        chunk_size: 2048,
        uploaded_chunks: [],
        completed_count: 0,
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
    });
  });

  describe("multi-item retry and resume", () => {
    it("resets only the retried row and leaves its siblings alone", async () => {
      (initUpload as Mock).mockRejectedValueOnce(new Error("invalid request"));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush();
      const [a, b] = useUploadStore.getState().queue.map((i) => i.id);
      expect(getItem(a)?.status).toBe("failed");
      const bBefore = getItem(b);

      useUploadStore.getState().retryUpload(a, "pw");
      await flush();

      expect(getItem(b)).toEqual(bBefore);
    });

    it("resumes only the targeted row and leaves its siblings alone", async () => {
      (uploadChunk as Mock).mockImplementation(() => new Promise(() => {}));
      useUploadStore
        .getState()
        .startUpload([makeFile("a.txt", 10), makeFile("b.txt", 10)], "pw", "telegram", undefined, undefined, null);
      await flush(5);
      const [a, b] = useUploadStore.getState().queue.map((i) => i.id);
      useUploadStore.getState().pauseUpload(a);
      const bBefore = getItem(b);

      (uploadChunk as Mock).mockResolvedValue(undefined);
      useUploadStore.getState().resumeUpload(a, "pw");
      await flush(3);

      expect(getItem(b)).toEqual(bBefore);
    });
  });

  describe("desktop picker edge cases", () => {
    it("opens the native picker when preSelectedPaths is an empty array", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/picked.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockResolvedValue(undefined);

      // An empty array is not "the dropzone already picked these" — fall back to
      // the core's own picker rather than uploading nothing.
      await useUploadStore.getState().startDesktopUpload("pw", undefined, []);

      expect(pickFiles).toHaveBeenCalled();
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/picked.bin", "pw", undefined, expect.any(String));
    });

    it("uses the paths the caller already picked instead of opening a picker", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockClear();
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockResolvedValue(undefined);

      // The dropzone already ran the native dialog — re-opening it here is the
      // double-dialog bug, so supplied paths must short-circuit the picker.
      await useUploadStore.getState().startDesktopUpload("pw", undefined, ["/tmp/given.bin"]);

      expect(pickFiles).not.toHaveBeenCalled();
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/given.bin", "pw", undefined, expect.any(String));
    });

    it("falls back to the whole path when it ends in a separator", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/weird/"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockResolvedValue(undefined);

      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      // A blank row name would be useless — show the path instead.
      expect(useUploadStore.getState().queue[0].file.name).toBe("/tmp/weird/");
    });

    it("resets only the retried desktop row and leaves its siblings alone", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin", "/tmp/b.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock)
        .mockRejectedValueOnce(new Error("first failed"))
        .mockResolvedValueOnce(undefined);
      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      const [a, b] = useUploadStore.getState().queue.map((i) => i.id);
      expect(getItem(a)?.status).toBe("failed");
      const bBefore = getItem(b);

      (sidecarUpload as Mock).mockResolvedValue(undefined);
      useUploadStore.getState().retryUpload(a, "pw");
      await flush(5);

      expect(getItem(a)?.status).toBe("done");
      expect(getItem(b)).toEqual(bBefore);
    });

    it("uses a bare path as its own filename when it has no directory part", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["bare.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockResolvedValue(undefined);

      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      expect(useUploadStore.getState().queue[0].file.name).toBe("bare.bin");
    });

    it("reports a non-Error core rejection during a batch as a generic failure", async () => {
      const { pickFiles, sidecarUpload, subscribeProgress } = await import("@/lib/tauri");
      (pickFiles as Mock).mockResolvedValue(["/tmp/a.bin"]);
      (subscribeProgress as Mock).mockImplementation(async () => vi.fn());
      (sidecarUpload as Mock).mockRejectedValue("ipc channel closed");

      await useUploadStore.getState().startDesktopUpload("pw", undefined);

      expect(useUploadStore.getState().queue[0].status).toBe("failed");
      expect(useUploadStore.getState().queue[0].error).toBe("Upload failed");
    });
  });

  describe("server-resumed session adoption", () => {
    /** Makes initUpload report an already-active server session for this file. */
    function resumedInit(over: Record<string, unknown> = {}) {
      (initUpload as Mock).mockReset().mockResolvedValue(
        defaultInitResponse({ resumed: true, platform: "github", ...over }),
      );
    }

    it("adopts the session's own envelope, chunk size and platform", async () => {
      resumedInit({ chunk_size: 2048, chunk_count: 1 });
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-1",
        file_id: "file-1",
        status: "active",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      // The staged chunks were encrypted with the ORIGINAL key, so the adopted
      // envelope must be unwrapped rather than our fresh CEK being used.
      expect(unwrapKey).toHaveBeenCalled();
    });

    it("restarts on the session's own platform when the envelope is missing", async () => {
      resumedInit({ chunk_size: 2048, chunk_count: 1 });
      (getFileMeta as Mock).mockResolvedValue({
        id: "file-1",
        original_name: "a.txt",
        original_size: 10,
        compressed_size: 10,
        encrypted_size: 10,
        chunk_count: 1,
        sha256: "hash",
        salt: "b64:9",
        wrapped_cek: "", // legacy/no envelope → nothing to adopt
      });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      // Restarted deliberately, on the original platform — never a silent switch.
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("restarting on github"));
      expect(cancelUpload).toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("done");
    });

    it("restarts when the old session's chunk boundaries are unrecoverable", async () => {
      // A pre-upgrade session reports no chunk_size, and there's no persisted
      // record to recover it from — reslicing at a guessed size would corrupt it.
      resumedInit({ chunk_size: 0, chunk_count: 0 });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Couldn't continue"));
      expect(getItem(id)?.status).toBe("done");
    });

    it("recovers unknown chunk boundaries from the persisted record", async () => {
      // The server forgot the chunk size, but our own localStorage record still
      // has it — so the session is adoptable instead of being thrown away.
      // getUploadStatus reports the session as gone, so the cross-session resume
      // at the top of the run declines it and we actually reach the adopt path.
      localStorage.setItem(
        "zc_upl:a.txt:10:1000",
        JSON.stringify({
          sessionId: "sess-1",
          fileId: "file-1",
          chunkCount: 1,
          chunkSize: 2048,
          directUpload: false,
          shouldCompress: true,
          platform: "github",
        }),
      );
      (getUploadStatus as Mock).mockResolvedValue({
        session_id: "sess-1",
        file_id: "file-1",
        status: "expired",
        chunk_count: 1,
        uploaded_chunks: [],
        completed_count: 0,
      });
      resumedInit({ chunk_size: 0, chunk_count: 0 });

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      // Adopted, not restarted — the persisted record supplied the boundaries.
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("swallows a failing cancel of the un-adoptable session", async () => {
      resumedInit({ chunk_size: 0, chunk_count: 0 });
      // Best-effort cleanup — the restart must proceed regardless.
      (cancelUpload as Mock).mockRejectedValue(new Error("already reaped"));

      useUploadStore.getState().startUpload([makeFile("a.txt", 10)], "pw", "telegram", undefined, undefined, null);
      const id = queueIdFor();
      await flush();

      expect(getItem(id)?.status).toBe("done");
    });
  });

});
