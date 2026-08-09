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
const tauriMocks = vi.hoisted(() => ({
  sidecarDownload: vi.fn(),
  sidecarBulkDownloadZip: vi.fn(),
  pickSaveLocation: vi.fn(),
  subscribeProgress: vi.fn(),
}));
vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return { ...actual, ...tauriMocks };
});

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
async function flush(times = 50) {
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
    tauriMocks.sidecarDownload.mockReset().mockResolvedValue(undefined);
    tauriMocks.sidecarBulkDownloadZip.mockReset().mockResolvedValue(undefined);
    tauriMocks.pickSaveLocation.mockReset().mockResolvedValue("/save/path");
    tauriMocks.subscribeProgress.mockReset().mockResolvedValue(vi.fn());
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

    it("has no Save-As picker when window is undefined (SSR-safe)", async () => {
      vi.stubGlobal("window", undefined);
      try {
        useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      } finally {
        vi.unstubAllGlobals();
      }
      const id = firstId();
      await flush();
      // No picker available -> falls straight through to the in-memory path.
      expect(getItem(id)?.status).toBe("done");
    });

    it("leaves an unrelated row with no pending update untouched by another row's flush", async () => {
      // Injected directly (not via startDownload), so it never calls
      // updateProgress and never has an entry in the throttled-update map.
      useDownloadStore.setState({
        queue: [
          {
            id: "bystander",
            fileId: "fX",
            filename: "x.bin",
            fileSize: 1,
            status: "queued",
            progress: 0,
            stage: "Queued",
            startedAt: 0,
          },
        ],
      });
      (downloadAndDecryptFile as Mock).mockImplementation(
        () => new Promise<void>((res) => setTimeout(res, 10)),
      );
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      await flush();

      expect(getItem("bystander")).toEqual(
        expect.objectContaining({ status: "queued", stage: "Queued", progress: 0 }),
      );
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

    it("falls back to a generic message when the pipeline rejects with a non-Error", async () => {
      // The browser path uses a literal "Download failed" fallback (not
      // String(err)), so a thrown string must not leak into the row's error.
      (downloadAndDecryptFile as Mock).mockRejectedValue("just a string");
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      const item = getItem(id)!;
      expect(item.status).toBe("failed");
      expect(item.error).toBe("Download failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: Download failed");
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

    it("reports a generic failure (no password cleared) when a wrong-key error hits a non-protected file", async () => {
      // File lives in a folder that is NOT in the protected registry, so
      // protectedFolderOf() falls through to `return null` — recovery is skipped
      // even though the message looks like a decrypt failure.
      queryClient.setQueryData(qk.files, [file({ id: "f1", folder_id: "folder-1" })]);
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");
      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));

      useDownloadStore.getState().startDownload("f1", "plain.txt", 10, "pw");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      // Not protected → password untouched, and the generic (not recovery) toast.
      expect(useFolderPasswordStore.getState().get("folder-1")).toBe("cached-pw");
      expect(toast.error).toHaveBeenCalledWith("Download failed: Decryption failed — wrong passphrase?");
    });

    it("paints progress from the pipeline's onProgress callback", async () => {
      let onProgress: DownloadOptions["onProgress"];
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) => {
        onProgress = opts.onProgress;
        return new Promise<void>(() => {}); // stays downloading so the tick lands
      });
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();

      onProgress!({ percent: 42, stage: "Decrypting", chunksDone: 1, chunksTotal: 2 });
      await flush();

      const item = getItem(id)!;
      expect(item.status).toBe("downloading");
      expect(item.progress).toBe(42);
      expect(item.stage).toBe("Decrypting");
    });

    it("ignores onProgress ticks once the download is paused", async () => {
      let onProgress: DownloadOptions["onProgress"];
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) => {
        onProgress = opts.onProgress;
        return new Promise<void>((_res, rej) => {
          opts.signal!.addEventListener("abort", () => rej(new FakeDownloadPausedError()));
        });
      });
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();

      onProgress!({ percent: 20, stage: "Downloading", chunksDone: 0, chunksTotal: 2 });
      await flush();
      expect(getItem(id)?.progress).toBe(20);

      useDownloadStore.getState().pauseDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("paused");

      // A late tick from the draining run must NOT flip it back or repaint progress.
      onProgress!({ percent: 80, stage: "Downloading", chunksDone: 1, chunksTotal: 2 });
      await flush();
      expect(getItem(id)?.status).toBe("paused");
      expect(getItem(id)?.progress).toBe(20);
    });

    it("fires a web notification when the tab is hidden", async () => {
      const ctorSpy = vi.fn();
      let instance: { onclick: (() => void) | null; close: Mock } | undefined;
      vi.stubGlobal("Notification", class {
        static permission = "granted";
        onclick: (() => void) | null = null;
        close = vi.fn();
        constructor(...a: unknown[]) {
          ctorSpy(...a);
          instance = this;
        }
      });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      await flush();
      expect(ctorSpy).toHaveBeenCalledWith("Download complete", expect.objectContaining({ tag: "download-done" }));

      // Clicking the notification focuses the tab and dismisses it.
      instance!.onclick!();
      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(instance!.close).toHaveBeenCalledTimes(1);

      // It also self-dismisses after 5s even if never clicked.
      vi.advanceTimersByTime(5000);
      expect(instance!.close).toHaveBeenCalledTimes(2);
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

    it("resume is a no-op for an unknown id", () => {
      expect(() => useDownloadStore.getState().resumeDownload("nope", "pw")).not.toThrow();
    });

    it("resume swaps in a new resolvePassword and leaves an unrelated row untouched", async () => {
      (downloadAndDecryptFile as Mock)
        .mockImplementationOnce((_id, _pp, opts: DownloadOptions) => {
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

      useDownloadStore.setState((s) => ({
        queue: [
          ...s.queue,
          { id: "bystander", fileId: "fX", filename: "x", fileSize: 1, status: "queued" as const, progress: 0, stage: "Queued", startedAt: 0 },
        ],
      }));

      const resolvePassword = vi.fn().mockResolvedValue("new-pw");
      useDownloadStore.getState().resumeDownload(id, "pw", resolvePassword);
      await flush();

      expect(lastCallOptions().resolvePassword).toBe(resolvePassword);
      expect(getItem(id)?.status).toBe("done");
      expect(getItem("bystander")).toEqual(
        expect.objectContaining({ status: "queued", stage: "Queued" }),
      );
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

    it("pause is a no-op for an unknown id", () => {
      expect(() => useDownloadStore.getState().pauseDownload("nope")).not.toThrow();
    });

    it("pause is a no-op once the download already reached a terminal state", async () => {
      (downloadAndDecryptFile as Mock).mockResolvedValue(undefined);
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("done");

      useDownloadStore.getState().pauseDownload(id);
      await flush();
      expect(getItem(id)?.status).toBe("done"); // still done, not flipped to "paused"
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

    it("swaps in a new resolvePassword and leaves an unrelated row untouched", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce(undefined);
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.setState((s) => ({
        queue: [
          ...s.queue,
          { id: "bystander", fileId: "fX", filename: "x", fileSize: 1, status: "queued" as const, progress: 0, stage: "Queued", startedAt: 0 },
        ],
      }));

      const resolvePassword = vi.fn().mockResolvedValue("new-pw");
      useDownloadStore.getState().retryDownload(id, "pw", resolvePassword);
      await flush();

      expect(lastCallOptions().resolvePassword).toBe(resolvePassword);
      expect(getItem(id)?.status).toBe("done");
      expect(getItem("bystander")).toEqual(
        expect.objectContaining({ status: "queued", stage: "Queued" }),
      );
    });

    it("no-ops a relaunch whose session was removed before it could start", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("blip"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.getState().retryDownload(id, "pw"); // schedules a relaunch
      useDownloadStore.getState().removeFromQueue(id); // session gone before it fires
      await expect(flush()).resolves.not.toThrow();
    });

    it("ignores a stale run's own completion once a newer relaunch has taken over the session", async () => {
      const resolvers: Array<() => void> = [];
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("blip"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockImplementation(
        () => new Promise<void>((res) => resolvers.push(res)),
      );
      // Two retries fired back-to-back (before either's relaunch has run) both
      // capture the SAME prior (already-settled) promise, so both eventually
      // invoke runSingleDownload — the second one supersedes the first's token.
      useDownloadStore.getState().retryDownload(id, "pw");
      useDownloadStore.getState().retryDownload(id, "pw");
      await flush();
      expect(resolvers).toHaveLength(2);

      // Resolve the now-stale first run — its own completion must be a no-op.
      resolvers[0]!();
      await flush();
      expect(toast.success).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("downloading"); // still owned by the 2nd run

      // The current (second) run's completion is the one that actually lands.
      resolvers[1]!();
      await flush();
      expect(getItem(id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it("ignores a stale run's own FAILURE once a newer relaunch has taken over the session", async () => {
      const rejecters: Array<(e: unknown) => void> = [];
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("blip"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockImplementation(
        () => new Promise<void>((_res, rej) => rejecters.push(rej)),
      );
      useDownloadStore.getState().retryDownload(id, "pw");
      useDownloadStore.getState().retryDownload(id, "pw");
      await flush();
      expect(rejecters).toHaveLength(2);

      // Ignore the setup failure's toast — only the post-retry ones matter here.
      (toast.error as Mock).mockClear();

      // The stale (superseded) run rejects with a non-Error value — its
      // failure must be a total no-op (not even a stringified toast).
      rejecters[0]!("plain string failure");
      await flush();
      expect(toast.error).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("downloading"); // untouched by the stale failure

      // The current (second) run's own failure is the one that actually lands.
      rejecters[1]!(new Error("real failure"));
      await flush();
      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: real failure");
    });

    it("restarts a desktop-originated ZIP through the desktop path (not the browser one)", async () => {
      tauriMocks.sidecarBulkDownloadZip
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined);
      const files: BulkDownloadFile[] = [{ fileId: "f1", filename: "a", fileSize: 1 }];
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.getState().retryDownload(id, "pw");
      await flush();

      expect(tauriMocks.sidecarBulkDownloadZip).toHaveBeenCalledTimes(2);
      expect(downloadAsZip).not.toHaveBeenCalled(); // the browser path was never used
      const newId = useDownloadStore.getState().queue[0].id;
      expect(getItem(newId)?.status).toBe("done");
    });
  });

  describe("autoResumeInterrupted", () => {
    it("resumes a transiently-failed download from its OWN session (no re-supplied passphrase)", async () => {
      let firstResume: unknown;
      (downloadAndDecryptFile as Mock)
        .mockImplementationOnce((_id, _pp, opts: DownloadOptions) => {
          firstResume = opts.resume;
          return Promise.reject(new Error("network blip")); // interruption
        })
        .mockResolvedValueOnce(undefined);

      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      // No passphrase passed — it reuses the session's stored one + resume state.
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();

      expect(useDownloadStore.getState().queue).toHaveLength(1);
      expect(lastCallOptions().resume).toBe(firstResume); // continuation, not restart
      expect(getItem(id)?.status).toBe("done");
    });

    it("does NOT auto-resume a permanent (integrity) failure — avoids a re-fail/re-toast loop", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(
        new Error("File integrity check failed — content hash mismatch")
      );
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockClear();
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();

      expect(downloadAndDecryptFile).not.toHaveBeenCalled(); // stayed failed, no retry
      expect(getItem(id)?.status).toBe("failed");
    });

    it("does NOT auto-resume a wrong-password failure", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("wrong passphrase"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockClear();
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();
      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
    });

    it("does nothing while offline", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("network blip"));
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockClear();
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();
      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
      expect(getItem(id)?.status).toBe("failed");
    });

    it("treats a failure with no recorded error message as transient (resumes it)", async () => {
      (downloadAndDecryptFile as Mock)
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce(undefined);
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      // Simulate a row whose error field never got recorded.
      useDownloadStore.setState((s) => ({
        queue: s.queue.map((i) => (i.id === id ? { ...i, error: undefined } : i)),
      }));

      useDownloadStore.getState().autoResumeInterrupted();
      await flush();
      expect(getItem(id)?.status).toBe("done");
    });

    it("resumes the right row and leaves an unrelated one untouched", async () => {
      (downloadAndDecryptFile as Mock)
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce(undefined);
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      useDownloadStore.setState((s) => ({
        queue: [
          ...s.queue,
          { id: "bystander", fileId: "fX", filename: "x", fileSize: 1, status: "queued" as const, progress: 0, stage: "Queued", startedAt: 0 },
        ],
      }));

      useDownloadStore.getState().autoResumeInterrupted();
      await flush();

      expect(getItem(id)?.status).toBe("done");
      expect(getItem("bystander")).toEqual(
        expect.objectContaining({ status: "queued", stage: "Queued" }),
      );
    });

    it("skips ZIP downloads (no resume pipeline / no single session)", async () => {
      (downloadAsZip as Mock).mockRejectedValueOnce(new Error("network blip"));
      useDownloadStore.getState().startBulkZipDownload([{ fileId: "f1", filename: "a", fileSize: 1 }], "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      (downloadAsZip as Mock).mockClear();
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();
      expect(downloadAsZip).not.toHaveBeenCalled(); // ZIP is not auto-resumed
    });

    it("leaves a done/downloading download untouched", async () => {
      useDownloadStore.getState().startDownload("f1", "a.bin", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("done");

      (downloadAndDecryptFile as Mock).mockClear();
      useDownloadStore.getState().autoResumeInterrupted();
      await flush();
      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
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

    it("removeFromQueue on an in-memory (no disk writable) download just aborts, no disk cleanup", async () => {
      (downloadAndDecryptFile as Mock).mockImplementation(
        () => new Promise((_res, rej) => setTimeout(() => rej(new Error("network blip")), 5)),
      );
      useDownloadStore.getState().startDownload("f1", "small.txt", 10, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      expect(() => useDownloadStore.getState().removeFromQueue(id)).not.toThrow();
      expect(getItem(id)).toBeUndefined();
    });

    it("swallows a failure aborting the open disk writable (best-effort cleanup)", async () => {
      const { writable } = stubPicker();
      writable.abort.mockRejectedValue(new Error("already closed"));
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts: DownloadOptions) => {
        opts.resume!.saveToDisk = writable;
        return Promise.reject(new Error("network blip"));
      });
      useDownloadStore.getState().startDownload("f1", "big.bin", ONE_GB, "pw");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("failed");

      expect(() => useDownloadStore.getState().removeFromQueue(id)).not.toThrow();
      await flush();
      expect(writable.abort).toHaveBeenCalled();
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

  describe("startDesktopDownload", () => {
    it("is deduped when the same file already has an active transfer", async () => {
      tauriMocks.pickSaveLocation.mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(useDownloadStore.getState().queue).toHaveLength(1);

      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(useDownloadStore.getState().queue).toHaveLength(1); // no 2nd row added
    });

    it("is deduped against a 'downloading' transfer of the same file", async () => {
      tauriMocks.pickSaveLocation.mockResolvedValue("/save/path");
      tauriMocks.sidecarDownload.mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(getItem(firstId())?.status).toBe("downloading");

      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(useDownloadStore.getState().queue).toHaveLength(1);
    });

    it("is deduped against a 'paused' transfer of the same file", async () => {
      useDownloadStore.setState({
        queue: [
          { id: "p1", fileId: "f1", filename: "a.bin", fileSize: 10, status: "paused", progress: 10, stage: "Paused", startedAt: 0 },
        ],
      });
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(useDownloadStore.getState().queue).toHaveLength(1); // no new row added
      expect(tauriMocks.pickSaveLocation).not.toHaveBeenCalled();
    });

    it("does not dedup a different file", async () => {
      tauriMocks.pickSaveLocation.mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      useDownloadStore.getState().startDesktopDownload("f2", "b.bin", 10, "pw", "user-1");
      await flush();
      expect(useDownloadStore.getState().queue).toHaveLength(2);
    });

    it("cancels when the native save dialog is dismissed", async () => {
      tauriMocks.pickSaveLocation.mockResolvedValue(null);
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
      expect(tauriMocks.sidecarDownload).not.toHaveBeenCalled();
    });

    it("cancels when the save dialog throws (unsupported / lost gesture)", async () => {
      tauriMocks.pickSaveLocation.mockRejectedValue(new Error("no dialog api"));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
      expect(tauriMocks.sidecarDownload).not.toHaveBeenCalled();
    });

    it("resolves a folder password up front and downloads via the sidecar", async () => {
      const resolvePassword = vi.fn().mockResolvedValue("folder-pw");
      useDownloadStore
        .getState()
        .startDesktopDownload("f1", "secret.bin", 10, "vault-pw", "user-1", resolvePassword);
      const id = firstId();
      await flush();

      expect(resolvePassword).toHaveBeenCalledWith("f1");
      expect(tauriMocks.sidecarDownload).toHaveBeenCalledWith(
        "f1",
        "folder-pw",
        "user-1",
        "/save/path"
      );
      expect(getItem(id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("secret.bin downloaded");
      expect(notifications.downloadComplete).toHaveBeenCalledWith("secret.bin");
    });

    it("falls back to the vault passphrase when resolving the folder password fails", async () => {
      const resolvePassword = vi.fn().mockRejectedValue(new Error("locked"));
      useDownloadStore
        .getState()
        .startDesktopDownload("f1", "a.bin", 10, "vault-pw", "user-1", resolvePassword);
      await flush();

      expect(tauriMocks.sidecarDownload).toHaveBeenCalledWith(
        "f1",
        "vault-pw",
        "user-1",
        "/save/path"
      );
    });

    it("forwards matching progress events as a percentage and ignores others", async () => {
      let progressCb: ((p: {
        file_id: string;
        stage: string;
        bytes_done: number;
        bytes_total: number;
      }) => void) | undefined;
      tauriMocks.subscribeProgress.mockImplementation(async (cb: typeof progressCb) => {
        progressCb = cb;
        return vi.fn();
      });
      tauriMocks.sidecarDownload.mockImplementation(() => new Promise(() => {}));

      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();

      progressCb!({ file_id: "other", stage: "x", bytes_done: 1, bytes_total: 10 });
      expect(getItem(id)?.progress).toBe(0);

      progressCb!({ file_id: "f1", stage: "Downloading", bytes_done: 0, bytes_total: 0 });
      await flush();
      expect(getItem(id)?.progress).toBe(0); // no total yet — percent stays unset, prior value kept

      progressCb!({ file_id: "f1", stage: "Downloading", bytes_done: 30, bytes_total: 120 });
      await flush();
      expect(getItem(id)?.progress).toBe(25);
      expect(getItem(id)?.stage).toBe("Downloading");
    });

    it("keeps the previous stage when a progress payload arrives with no stage", async () => {
      // `stage` is typed as a string, but the payload crosses an IPC boundary
      // (the Rust core emits zcrypt://progress), so a partial event really can
      // arrive without it. The row must keep its prior stage, not blank it out.
      type PartialProgress = {
        file_id: string;
        bytes_done: number;
        bytes_total: number;
        stage?: string;
      };
      let progressCb: ((p: PartialProgress) => void) | undefined;
      tauriMocks.subscribeProgress.mockImplementation(
        async (cb: (p: PartialProgress) => void) => {
          progressCb = cb;
          return vi.fn();
        },
      );
      tauriMocks.sidecarDownload.mockImplementation(() => new Promise(() => {}));

      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.stage).toBe("Starting…");

      progressCb!({ file_id: "f1", bytes_done: 30, bytes_total: 120 });
      await flush();
      expect(getItem(id)?.progress).toBe(25); // percent still applied
      expect(getItem(id)?.stage).toBe("Starting…"); // prior stage preserved
    });

    it("reports a network/DNS failure with the actionable hint", async () => {
      tauriMocks.sidecarDownload.mockRejectedValue(new Error("dns error: failed to lookup address"));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("Can't reach zcrypt's servers (network/DNS)");
      expect(toast.error).toHaveBeenCalledWith(
        "Can't reach zcrypt's servers — check your internet, and if you're on a restricted or filtered network, connect a VPN and retry."
      );
      expect(notifications.downloadFailed).toHaveBeenCalledWith(
        "a.bin",
        "Network/DNS — try a VPN"
      );
    });

    it("recovers a protected folder's cached password on a wrong-key failure", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "f1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");
      tauriMocks.sidecarDownload.mockRejectedValue(new Error("wrong passphrase"));

      useDownloadStore.getState().startDesktopDownload("f1", "secret.bin", 10, "vault-pw", "user-1");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith(
        "Wrong folder password for secret.bin. Retry to re-enter it."
      );
    });

    it("reports a plain failure for any other error", async () => {
      tauriMocks.sidecarDownload.mockRejectedValue(new Error("disk full"));
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: disk full");
    });

    it("stringifies a non-Error rejection", async () => {
      tauriMocks.sidecarDownload.mockRejectedValue("plain string failure");
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: plain string failure");
    });

    it("unsubscribes progress once the download settles", async () => {
      const unlisten = vi.fn();
      tauriMocks.subscribeProgress.mockResolvedValue(unlisten);
      useDownloadStore.getState().startDesktopDownload("f1", "a.bin", 10, "pw", "user-1");
      await flush();
      expect(unlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe("startDesktopBulkZipDownload", () => {
    const files: BulkDownloadFile[] = [
      { fileId: "f1", filename: "a.txt", fileSize: 100 },
      { fileId: "f2", filename: "b.txt", fileSize: 200 },
    ];

    it("cancels when the native save dialog is dismissed", async () => {
      tauriMocks.pickSaveLocation.mockResolvedValue(null);
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
      expect(tauriMocks.sidecarBulkDownloadZip).not.toHaveBeenCalled();
    });

    it("cancels when the save dialog throws", async () => {
      tauriMocks.pickSaveLocation.mockRejectedValue(new Error("no dialog api"));
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      const id = firstId();
      await flush();
      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("resolves each file's own password and downloads them as one ZIP via the sidecar", async () => {
      const resolvePassword = vi.fn(async (fileId: string) => `pw-${fileId}`);
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "vault-pw", "user-1", resolvePassword);
      const id = firstId();
      await flush();

      expect(tauriMocks.sidecarBulkDownloadZip).toHaveBeenCalledWith(
        [
          { fileId: "f1", filename: "a.txt", passphrase: "pw-f1" },
          { fileId: "f2", filename: "b.txt", passphrase: "pw-f2" },
        ],
        "user-1",
        "/save/path"
      );
      expect(getItem(id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("ZIP with 2 files downloaded");
      expect(notifications.downloadComplete).toHaveBeenCalledWith("2 files (ZIP)");
    });

    it("falls back to the vault passphrase for a file whose password resolution fails", async () => {
      const resolvePassword = vi.fn(async (fileId: string) => {
        if (fileId === "f2") throw new Error("locked");
        return "pw-f1";
      });
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "vault-pw", "user-1", resolvePassword);
      await flush();

      expect(tauriMocks.sidecarBulkDownloadZip).toHaveBeenCalledWith(
        [
          { fileId: "f1", filename: "a.txt", passphrase: "pw-f1" },
          { fileId: "f2", filename: "b.txt", passphrase: "vault-pw" },
        ],
        "user-1",
        "/save/path"
      );
    });

    it("forwards progress scaled across the whole batch and ignores unrelated events", async () => {
      let progressCb:
        | ((p: { file_id: string; stage: string; chunks_done: number; chunks_total: number }) => void)
        | undefined;
      tauriMocks.subscribeProgress.mockImplementation(async (cb: typeof progressCb) => {
        progressCb = cb;
        return vi.fn();
      });
      tauriMocks.sidecarBulkDownloadZip.mockImplementation(() => new Promise(() => {}));

      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      const id = firstId();
      await flush();

      // Unrelated file id, and a zero chunk total, are both ignored.
      progressCb!({ file_id: "other", stage: "x", chunks_done: 1, chunks_total: 4 });
      progressCb!({ file_id: "f1", stage: "x", chunks_done: 1, chunks_total: 0 });
      expect(getItem(id)?.progress).toBe(0);

      // f2 is index 1 of 2, half done -> (1 + 0.5) / 2 = 75%.
      progressCb!({ file_id: "f2", stage: "Downloading", chunks_done: 1, chunks_total: 2 });
      await flush();
      expect(getItem(id)?.progress).toBe(75);
      expect(getItem(id)?.stage).toBe("Downloading (2/2)");
    });

    it("reports a network/DNS failure with the actionable hint", async () => {
      tauriMocks.sidecarBulkDownloadZip.mockRejectedValue(
        new Error("connection refused")
      );
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(getItem(id)?.error).toBe("Can't reach zcrypt's servers (network/DNS)");
      expect(toast.error).toHaveBeenCalledWith(
        "Can't reach zcrypt's servers — check your internet, and if you're on a restricted or filtered network, connect a VPN and retry."
      );
    });

    it("recovers protected folders' cached passwords on a wrong-key failure", async () => {
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: "folder-2" }),
      ]);
      useFolderRegistry.setState({
        byId: {
          "folder-1": { pwSalt: "s", pwVerifier: "v" },
          "folder-2": { pwSalt: "s", pwVerifier: "v" },
        },
      });
      useFolderPasswordStore.getState().set("folder-1", "cached-1");
      useFolderPasswordStore.getState().set("folder-2", "cached-2");
      tauriMocks.sidecarBulkDownloadZip.mockRejectedValue(new Error("wrong passphrase"));

      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      await flush();

      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(useFolderPasswordStore.getState().get("folder-2")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith(
        "Wrong folder password in this ZIP. Retry to re-enter it."
      );
    });

    it("reports a plain failure for any other error", async () => {
      tauriMocks.sidecarBulkDownloadZip.mockRejectedValue(new Error("disk full"));
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      await flush();
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: disk full");
    });

    it("stringifies a non-Error rejection", async () => {
      tauriMocks.sidecarBulkDownloadZip.mockRejectedValue("plain string failure");
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      await flush();
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: ZIP download failed");
    });

    it("recovers only the files that are actually in a protected folder", async () => {
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: null }),
      ]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-1");
      tauriMocks.sidecarBulkDownloadZip.mockRejectedValue(new Error("wrong passphrase"));

      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      await flush();

      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith(
        "Wrong folder password in this ZIP. Retry to re-enter it."
      );
    });

    it("unsubscribes progress once the batch settles", async () => {
      const unlisten = vi.fn();
      tauriMocks.subscribeProgress.mockResolvedValue(unlisten);
      useDownloadStore.getState().startDesktopBulkZipDownload(files, "pw", "user-1");
      await flush();
      expect(unlisten).toHaveBeenCalledTimes(1);
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

    it("paints ZIP progress from downloadAsZip's onProgress callback", async () => {
      (downloadAsZip as Mock).mockImplementation((_f, _pp, opts) => {
        opts.onProgress({ percent: 33, stage: "Zipping" });
        return new Promise<void>(() => {}); // stays downloading so the tick lands
      });
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();

      const item = getItem(id)!;
      expect(item.status).toBe("downloading");
      expect(item.progress).toBe(33);
      expect(item.stage).toBe("Zipping");
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

    it("reports a plain failure for a non-wrong-key error", async () => {
      (downloadAsZip as Mock).mockRejectedValueOnce(new Error("disk full"));
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: disk full");
    });

    it("stringifies a non-Error rejection", async () => {
      (downloadAsZip as Mock).mockRejectedValueOnce("plain string failure");
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = firstId();
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: ZIP download failed");
    });

    it("recovers only the files that are actually in a protected folder", async () => {
      // f1 is protected; f2 is not — recovery must be per-file, not all-or-nothing.
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: null }),
      ]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-1");
      (downloadAsZip as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));

      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      await flush();

      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
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
