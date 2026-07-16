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

  afterEach(() => {
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
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/a.bin", "pw", undefined);
      expect(sidecarUpload).toHaveBeenCalledWith("/tmp/b.bin", "pw", undefined);
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
      expect(sidecarUpload).toHaveBeenLastCalledWith("/tmp/a.bin", "pw", undefined);
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
});
