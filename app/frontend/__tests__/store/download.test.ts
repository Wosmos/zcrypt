import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// Node's built-in `localStorage` throws unguarded; store/download.ts transitively
// imports store/auth.ts (via useFolderProtection -> lib/api). Install a working
// stub before the first import (hence vi.hoisted).
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    },
  });
});

// A real DownloadPausedError class shared with the store (both import it from
// this same mocked module), so the store's `err instanceof DownloadPausedError`
// check works. Declared INSIDE the factory since vi.mock is hoisted above any
// top-level declarations; tests use the imported `DownloadPausedError` below.
vi.mock("@/lib/download-session", () => ({
  downloadAndDecryptFile: vi.fn(),
  DownloadPausedError: class DownloadPausedError extends Error {
    constructor() { super("Download paused"); this.name = "DownloadPausedError"; }
  },
}));
vi.mock("@/lib/bulk-download", () => ({
  downloadAsZip: vi.fn(),
}));

import { useDownloadStore } from "@/store/download";
import { downloadAndDecryptFile, DownloadPausedError, type DownloadOptions } from "@/lib/download-session";
const FakeDownloadPausedError = DownloadPausedError;
import { downloadAsZip, type BulkDownloadFile } from "@/lib/bulk-download";
import { toast } from "@/store/toast";
import { notifications } from "@/store/notifications";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import type { FileMetadata } from "@/types";

const ONE_GB = 1024 * 1024 * 1024;

function file(overrides: Partial<FileMetadata> & { id: string }): FileMetadata {
  return {
    original_name: "file", original_size: 1, compressed_size: 1, encrypted_size: 1,
    chunk_count: 1, sha256: "hash", created_at: "2026-01-01T00:00:00Z", folder_id: null,
    ...overrides,
  };
}

function makeDiskWritable() {
  return { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
}
function stubPicker() {
  const writable = makeDiskWritable();
  const handle = { createWritable: vi.fn(async () => writable) };
  const picker = vi.fn(async () => handle);
  vi.stubGlobal("showSaveFilePicker", picker);
  return { picker, handle, writable };
}

// The store throttles progress via a module-level rAF pair; drive fake timers so
// scheduled frames actually flush and don't leak between tests.
async function flush(times = 12) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    vi.advanceTimersByTime(20);
  }
}
function getItem(id: string) {
  return useDownloadStore.getState().queue.find((i) => i.id === id);
}
function firstId() {
  return useDownloadStore.getState().queue[0].id;
}
function lastCallOptions(): DownloadOptions {
  const calls = (downloadAndDecryptFile as Mock).mock.calls;
  return calls[calls.length - 1][2] as DownloadOptions;
}

describe("useDownloadStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    (downloadAndDecryptFile as Mock).mockReset().mockResolvedValue(undefined);
    (downloadAsZip as Mock).mockReset().mockResolvedValue(undefined);
    useDownloadStore.setState({ queue: [] });
    useFolderRegistry.setState({ byId: {} });
    useFolderPasswordStore.setState({ cache: {} });
    queryClient.setQueryData(qk.files, []);
    vi.spyOn(toast, "success").mockImplementation(() => {});
    vi.spyOn(toast, "error").mockImplementation(() => {});
    vi.spyOn(notifications, "downloadComplete").mockImplementation(() => {});
    vi.spyOn(notifications, "downloadFailed").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (document as { hidden?: boolean }).hidden;
    vi.restoreAllMocks();
  });

  describe("startDownload", () => {
    it("downloads a small file in-memory (no picker) and lands done", async () => {
      const { picker } = stubPicker();
      useDownloadStore.getState().startDownload("f1", "small.txt", ONE_GB - 1, "pw");
      const id = firstId();
      await flush();

      expect(picker).not.toHaveBeenCalled();
      expect(downloadAndDecryptFile).toHaveBeenCalledTimes(1);
      expect(lastCallOptions().saveToDisk).toBeUndefined();
      expect(getItem(id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("small.txt downloaded");
    });

    it("passes a persistent resume object and a pausing() callback into the pipeline", async () => {
      useDownloadStore.getState().startDownload("f1", "small.txt", 10, "pw");
      await flush();
      const opts = lastCallOptions();
      expect(opts.resume).toBeDefined();
      expect(typeof opts.pausing).toBe("function");
      expect(opts.pausing!()).toBe(false); // not paused
    });

    it("defaults to the global folder-aware resolver when none is passed", async () => {
      useDownloadStore.getState().startDownload("f1", "s.txt", 10, "pw");
      await flush();
      expect(lastCallOptions().resolvePassword).toBe(resolveFilePasswordGlobal);
    });

    it("streams a large file to disk when the user picks a location", async () => {
      const { picker, handle, writable } = stubPicker();
      useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      const id = firstId();
      await flush();

      expect(picker).toHaveBeenCalledWith({ suggestedName: "big.bin" });
      expect(handle.createWritable).toHaveBeenCalledTimes(1);
      expect(lastCallOptions().resume?.saveToDisk).toBe(writable);
      expect(getItem(id)?.status).toBe("done");
    });

    it("cancels cleanly when the user dismisses the Save-As picker", async () => {
      vi.stubGlobal("showSaveFilePicker", vi.fn(async () => { throw new DOMException("cancelled", "AbortError"); }));
      useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      const id = firstId();
      await flush();
      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("falls back to in-memory when the picker throws a non-abort error", async () => {
      vi.stubGlobal("showSaveFilePicker", vi.fn(async () => { throw new Error("not supported"); }));
      useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      const id = firstId();
      await flush();
      expect(lastCallOptions().resume?.saveToDisk).toBeUndefined();
      expect(getItem(id)?.status).toBe("done");
    });

    it("marks failed and keeps the session on a plain failure", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("network blip"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      const item = getItem(id)!;
      expect(item.status).toBe("failed");
      expect(item.error).toBe("network blip");
      expect(toast.error).toHaveBeenCalledWith("Download failed: network blip");
    });

    it("recovers a protected folder's cached password on a wrong-key failure", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "f1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");
      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));

      useDownloadStore.getState().startDownload("f1", "secret.txt", 10, "vault-pw");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Wrong folder password for secret.txt. Retry to re-enter it.");
    });

    it("fires a web notification when the tab is hidden", async () => {
      const ctorSpy = vi.fn();
      vi.stubGlobal("Notification", class {
        static permission = "granted";
        onclick: (() => void) | null = null;
        close = vi.fn();
        constructor(...a: unknown[]) { ctorSpy(...a); }
      });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      await flush();
      expect(ctorSpy).toHaveBeenCalledWith("Download complete", expect.objectContaining({ tag: "download-done" }));
    });
  });

  describe("pause / resume", () => {
    it("pauses a running download: aborts the run and marks it paused, keeping the session", async () => {
      let capturedSignal: AbortSignal | undefined;
      let capturedPausing: (() => boolean) | undefined;
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) => {
        capturedSignal = opts.signal;
        capturedPausing = opts.pausing;
        return new Promise((_res, rej) => {
          opts.signal!.addEventListener("abort", () => {
            rej(opts.pausing!() ? new FakeDownloadPausedError() : new DOMException("cancelled", "AbortError"));
          });
        });
      });
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(capturedSignal!.aborted).toBe(false);

      useDownloadStore.getState().pauseDownload(id);
      expect(capturedPausing!()).toBe(true);
      expect(capturedSignal!.aborted).toBe(true);
      await flush();
      expect(getItem(id)?.status).toBe("paused");
    });

    it("resume continues on the SAME resume object (not a fresh restart)", async () => {
      let firstResume: unknown;
      (downloadAndDecryptFile as Mock)
        .mockImplementationOnce((_id, _pp, opts: DownloadOptions) => {
          firstResume = opts.resume;
          return new Promise((_res, rej) => {
            opts.signal!.addEventListener("abort", () => rej(new FakeDownloadPausedError()));
          });
        })
        .mockResolvedValueOnce(undefined);

      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      useDownloadStore.getState().pauseDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("paused");

      useDownloadStore.getState().resumeDownload(id, "pw");
      await flush();

      expect(downloadAndDecryptFile).toHaveBeenCalledTimes(2);
      // Same persistent resume state object threaded into the second run.
      expect(lastCallOptions().resume).toBe(firstResume);
      expect(getItem(id)?.status).toBe("done");
    });

    it("pause is a no-op for a ZIP download (not pausable)", async () => {
      (downloadAsZip as Mock).mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startBulkZipDownload([{ fileId: "f1", filename: "a", fileSize: 1 }], "pw");
      const id = firstId();
      await flush();
      useDownloadStore.getState().pauseDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("downloading"); // unchanged
    });
  });

  describe("retry", () => {
    it("continues the SAME session on retry after a failure (does not restart from scratch)", async () => {
      let firstResume: unknown;
      (downloadAndDecryptFile as Mock)
        .mockImplementationOnce((_id, _pp, opts: DownloadOptions) => {
          firstResume = opts.resume;
          return Promise.reject(new Error("network blip"));
        })
        .mockResolvedValueOnce(undefined);

      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.getState().retryDownload(id, "pw");
      await flush();

      // Same queue row, same resume object — a continuation, not a new download.
      expect(useDownloadStore.getState().queue).toHaveLength(1);
      expect(lastCallOptions().resume).toBe(firstResume);
      expect(getItem(id)?.status).toBe("done");
    });

    it("restarts a ZIP download on retry (ZIP has no resume pipeline)", async () => {
      (downloadAsZip as Mock).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
      const files: BulkDownloadFile[] = [{ fileId: "f1", filename: "a", fileSize: 1 }];
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.getState().retryDownload(id, "pw");
      await flush();

      expect(useDownloadStore.getState().queue).toHaveLength(1);
      expect(getItem(useDownloadStore.getState().queue[0].id)?.status).toBe("done");
      expect(downloadAsZip).toHaveBeenCalledTimes(2);
    });

    it("falls back to a fresh single download when the session is already gone", async () => {
      // A row with no session/zip session (e.g. survived a store reset) — retry
      // must still restart it as a plain single download rather than no-op.
      useDownloadStore.setState({
        queue: [{ id: "orphan", fileId: "f9", filename: "z.bin", fileSize: 10, status: "failed", progress: 0, stage: "Failed", startedAt: 0 }],
      });
      useDownloadStore.getState().retryDownload("orphan", "pw");
      await flush();

      expect(downloadAndDecryptFile).toHaveBeenCalledTimes(1);
      expect((downloadAndDecryptFile as Mock).mock.calls[0][0]).toBe("f9");
      expect(getItem(useDownloadStore.getState().queue[0].id)?.status).toBe("done");
    });

    it("is a no-op for an unknown id", () => {
      expect(() => useDownloadStore.getState().retryDownload("nope", "pw")).not.toThrow();
      expect(useDownloadStore.getState().queue).toHaveLength(0);
    });
  });

  describe("cancel / remove", () => {
    it("cancelDownload aborts as a CANCEL (pausing stays false) and lands cancelled", async () => {
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) =>
        new Promise((_res, rej) => {
          opts.signal!.addEventListener("abort", () =>
            rej(opts.pausing!() ? new FakeDownloadPausedError() : new DOMException("cancelled", "AbortError"))
          );
        })
      );
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();

      useDownloadStore.getState().cancelDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("removeFromQueue aborts an open disk writable left by a paused/failed streaming download", async () => {
      const { writable } = stubPicker();
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) => {
        // Simulate the pipeline having opened the writable into resume state.
        opts.resume!.saveToDisk = writable;
        return Promise.reject(new Error("network blip"));
      });
      useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.getState().removeFromQueue(id);
      await flush();
      expect(writable.abort).toHaveBeenCalled();
      expect(getItem(id)).toBeUndefined();
    });

    it("removeFromQueue on an unknown id does not throw", () => {
      expect(() => useDownloadStore.getState().removeFromQueue("nope")).not.toThrow();
    });

    it("cancelDownload aborts an in-flight ZIP download", async () => {
      (downloadAsZip as Mock).mockImplementation((_f, _pp, opts) =>
        new Promise((_res, rej) => { opts.signal.addEventListener("abort", () => rej(new DOMException("cancelled", "AbortError"))); })
      );
      useDownloadStore.getState().startBulkZipDownload([{ fileId: "f1", filename: "a", fileSize: 1 }], "pw");
      const id = firstId();
      await flush();

      useDownloadStore.getState().cancelDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("removeFromQueue aborts an in-flight ZIP and drops the row", async () => {
      (downloadAsZip as Mock).mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startBulkZipDownload([{ fileId: "f1", filename: "a", fileSize: 1 }], "pw");
      const id = firstId();
      await flush();

      useDownloadStore.getState().removeFromQueue(id);
      expect(getItem(id)).toBeUndefined();
    });
  });

  describe("startBulkZipDownload", () => {
    const files: BulkDownloadFile[] = [
      { fileId: "f1", filename: "a.txt", fileSize: 100 },
      { fileId: "f2", filename: "b.txt", fileSize: 200 },
    ];

    it("queues one ZIP row covering all files and completes", async () => {
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const item = useDownloadStore.getState().queue[0];
      expect(item.fileId).toBe("zip");
      expect(item.fileSize).toBe(300);
      await flush();
      expect(getItem(item.id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("ZIP with 2 files downloaded");
    });

    it("cancels cleanly when aborted mid-zip", async () => {
      (downloadAsZip as Mock).mockImplementation((_f, _pp, opts) =>
        new Promise((_res, rej) => { opts.signal.addEventListener("abort", () => rej(new DOMException("cancelled", "AbortError"))); })
      );
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();
      useDownloadStore.getState().cancelDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("recovers every protected folder in the ZIP on a wrong-key failure", async () => {
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: "folder-2" }),
      ]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s1", pwVerifier: "v1" }, "folder-2": { pwSalt: "s2", pwVerifier: "v2" } } });
      useFolderPasswordStore.getState().set("folder-1", "pw1");
      useFolderPasswordStore.getState().set("folder-2", "pw2");
      (downloadAsZip as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));

      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(useFolderPasswordStore.getState().get("folder-2")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Wrong folder password in this ZIP. Retry to re-enter it.");
    });
  });

  describe("clearCompleted", () => {
    it("removes done and cancelled items but keeps failed/downloading/queued/paused", () => {
      useDownloadStore.setState({
        queue: [
          { id: "1", fileId: "f", filename: "done", fileSize: 1, status: "done", progress: 100, stage: "Done", startedAt: 0 },
          { id: "2", fileId: "f", filename: "cancelled", fileSize: 1, status: "cancelled", progress: 0, stage: "Cancelled", startedAt: 0 },
          { id: "3", fileId: "f", filename: "failed", fileSize: 1, status: "failed", progress: 0, stage: "Failed", startedAt: 0 },
          { id: "4", fileId: "f", filename: "dl", fileSize: 1, status: "downloading", progress: 50, stage: "...", startedAt: 0 },
          { id: "5", fileId: "f", filename: "paused", fileSize: 1, status: "paused", progress: 30, stage: "Paused", startedAt: 0 },
        ],
      });
      useDownloadStore.getState().clearCompleted();
      expect(useDownloadStore.getState().queue.map((i) => i.id)).toEqual(["3", "4", "5"]);
    });
  });
});
