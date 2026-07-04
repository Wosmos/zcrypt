import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// This environment's global `localStorage` (Node's built-in, not jsdom's) is a
// non-functional stub unless `--localstorage-file` is set, so a bare
// `localStorage.getItem(...)` throws. store/auth.ts reads it unguarded at
// MODULE LOAD time, and download.ts transitively imports it (via
// useFolderProtection -> lib/api -> store/auth), so the stub must be installed
// before the very first import anywhere (hence vi.hoisted).
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

import { useDownloadStore } from "@/store/download";
import { downloadAndDecryptFile } from "@/lib/download-session";
import { downloadAsZip, type BulkDownloadFile } from "@/lib/bulk-download";
import { toast } from "@/store/toast";
import { notifications } from "@/store/notifications";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import type { FileMetadata } from "@/types";

vi.mock("@/lib/download-session", () => ({
  downloadAndDecryptFile: vi.fn(),
}));
vi.mock("@/lib/bulk-download", () => ({
  downloadAsZip: vi.fn(),
}));

const ONE_GB = 1024 * 1024 * 1024;

function file(overrides: Partial<FileMetadata> & { id: string }): FileMetadata {
  return {
    original_name: "file",
    original_size: 1,
    compressed_size: 1,
    encrypted_size: 1,
    chunk_count: 1,
    sha256: "hash",
    created_at: "2026-01-01T00:00:00Z",
    folder_id: null,
    ...overrides,
  };
}

function makeDiskWritable() {
  return {
    write: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  };
}

function stubPicker(overrides?: { createWritable?: () => Promise<unknown> }) {
  const writable = makeDiskWritable();
  const handle = { createWritable: vi.fn(overrides?.createWritable ?? (async () => writable)) };
  const picker = vi.fn(async () => handle);
  vi.stubGlobal("showSaveFilePicker", picker);
  return { picker, handle, writable };
}

// store/download.ts throttles progress writes through a MODULE-LEVEL (not
// zustand-state) `pendingUpdates`/`flushScheduled` pair, flushed on the next
// `requestAnimationFrame`. Draining microtasks alone (a bare `await
// Promise.resolve()` loop) never fires a real rAF, so a scheduled-but-unfired
// frame from one test leaks into the next and permanently wedges
// `flushScheduled` true (every later `scheduleFlush()` call becomes a no-op).
// Running under fake timers and advancing them here guarantees every
// scheduled frame actually drains before the test ends.
async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    vi.advanceTimersByTime(20);
  }
}

function getItem(id: string) {
  return useDownloadStore.getState().queue.find((i) => i.id === id);
}

interface FakeNotificationInstance {
  title: string;
  options?: NotificationOptions;
  close: ReturnType<typeof vi.fn>;
  onclick: (() => void) | null;
}

function makeFakeNotificationCtor(permission: NotificationPermission) {
  const instances: FakeNotificationInstance[] = [];
  function Ctor(this: FakeNotificationInstance, title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    this.close = vi.fn();
    this.onclick = null;
    instances.push(this);
  }
  Ctor.permission = permission;
  Ctor.instances = instances;
  return Ctor as unknown as typeof Notification & { instances: FakeNotificationInstance[] };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

describe("useDownloadStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    (downloadAndDecryptFile as Mock).mockReset().mockResolvedValue(undefined);
    (downloadAsZip as Mock).mockReset().mockResolvedValue(undefined);
    useDownloadStore.setState({ queue: [], controllers: new Map() });
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
    it("goes straight to in-memory decrypt for a file under the streaming threshold, even with a picker available", async () => {
      const { picker } = stubPicker();
      useDownloadStore.getState().startDownload("file-1", "small.txt", ONE_GB - 1, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(picker).not.toHaveBeenCalled();
      expect(downloadAndDecryptFile).toHaveBeenCalledTimes(1);
      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.saveToDisk).toBeUndefined();
      expect(getItem(id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("small.txt downloaded");
      expect(notifications.downloadComplete).toHaveBeenCalledWith("small.txt");
    });

    it("uses resolveFilePasswordGlobal by default when no resolver is passed", async () => {
      useDownloadStore.getState().startDownload("file-1", "small.txt", 10, "pw");
      await flush();
      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.resolvePassword).toBe(resolveFilePasswordGlobal);
    });

    it("threads a custom resolvePassword through instead of the global default", async () => {
      const custom = vi.fn(async () => "resolved");
      useDownloadStore.getState().startDownload("file-1", "small.txt", 10, "pw", custom);
      await flush();
      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.resolvePassword).toBe(custom);
      expect(options.resolvePassword).not.toBe(resolveFilePasswordGlobal);
    });

    it("streams a large file to disk when the user picks a save location", async () => {
      const { picker, handle, writable } = stubPicker();
      useDownloadStore.getState().startDownload("file-1", "big.bin", ONE_GB, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(picker).toHaveBeenCalledWith({ suggestedName: "big.bin" });
      expect(handle.createWritable).toHaveBeenCalledTimes(1);
      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.saveToDisk).toBe(writable);
      expect(getItem(id)?.status).toBe("done");
    });

    it("cancels cleanly when the user dismisses the Save-As picker", async () => {
      const abortErr = new DOMException("cancelled", "AbortError");
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn(async () => {
          throw abortErr;
        })
      );
      useDownloadStore.getState().startDownload("file-1", "big.bin", ONE_GB, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
      const item = getItem(id)!;
      expect(item.status).toBe("cancelled");
      expect(item.stage).toBe("Cancelled");
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("falls back to the in-memory path when the picker throws something other than AbortError", async () => {
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn(async () => {
          throw new Error("not supported in this browser");
        })
      );
      useDownloadStore.getState().startDownload("file-1", "big.bin", ONE_GB, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.saveToDisk).toBeUndefined();
      expect(getItem(id)?.status).toBe("done");
    });

    it("falls back to the in-memory path when showSaveFilePicker doesn't exist on window", async () => {
      expect("showSaveFilePicker" in window).toBe(false);
      useDownloadStore.getState().startDownload("file-1", "big.bin", ONE_GB, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      const [, , options] = (downloadAndDecryptFile as Mock).mock.calls[0];
      expect(options.saveToDisk).toBeUndefined();
      expect(getItem(id)?.status).toBe("done");
    });

    it("throttles rapid progress updates to a single rAF-batched write, keeping only the latest", () => {
      vi.useFakeTimers();
      let capturedOpts: { onProgress: (i: { percent: number; stage: string }) => void } | undefined;
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts) => {
        capturedOpts = opts;
        return new Promise(() => {});
      });

      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      expect(getItem(id)?.stage).toBe("Queued");

      vi.advanceTimersByTime(20);
      expect(getItem(id)?.stage).toBe("Starting...");
      expect(capturedOpts).toBeDefined();

      capturedOpts!.onProgress({ percent: 10, stage: "chunk A" });
      capturedOpts!.onProgress({ percent: 20, stage: "chunk B" });
      // Second call lands while a frame is already scheduled (flushScheduled guard).
      expect(getItem(id)?.stage).toBe("Starting...");

      vi.advanceTimersByTime(20);
      const item = getItem(id)!;
      expect(item.progress).toBe(20);
      expect(item.stage).toBe("chunk B");
      expect(item.status).toBe("downloading");

      // A partial progress payload falls back to the item's existing progress/stage.
      capturedOpts!.onProgress({ percent: undefined as unknown as number, stage: undefined as unknown as string });
      vi.advanceTimersByTime(20);
      const after = getItem(id)!;
      expect(after.progress).toBe(20);
      expect(after.stage).toBe("chunk B");
    });

    it("leaves an unrelated queued item untouched by another download's throttled flush", () => {
      vi.useFakeTimers();
      let capturedOpts: { onProgress: (i: { percent: number; stage: string }) => void } | undefined;
      (downloadAndDecryptFile as Mock).mockImplementation((fileId, _pp, opts) => {
        if (fileId === "file-1") capturedOpts = opts;
        return new Promise(() => {});
      });

      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      useDownloadStore.getState().startDownload("file-2", "b.bin", 10, "pw");
      const [idA, idB] = useDownloadStore.getState().queue.map((i) => i.id);
      vi.advanceTimersByTime(20); // flush both "Starting..." writes

      capturedOpts!.onProgress({ percent: 55, stage: "only A" });
      vi.advanceTimersByTime(20);

      expect(getItem(idA)?.stage).toBe("only A");
      expect(getItem(idB)?.stage).toBe("Starting...");
      expect(getItem(idB)?.status).toBe("downloading");
    });

    it("ignores a stale scheduled frame once the download already reached a terminal state", async () => {
      vi.useFakeTimers();
      let capturedOpts: { onProgress: (i: { percent: number; stage: string }) => void } | undefined;
      let resolveDownload: () => void;
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts) => {
        capturedOpts = opts;
        return new Promise<void>((res) => {
          resolveDownload = res;
        });
      });

      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      vi.advanceTimersByTime(20); // flush "Starting..."

      capturedOpts!.onProgress({ percent: 40, stage: "halfway" }); // schedules a frame
      resolveDownload!();
      await flush(); // terminal "done" update runs synchronously, deleting the pending entry

      expect(getItem(id)?.status).toBe("done");

      vi.advanceTimersByTime(20); // the stale frame now fires with an empty pendingUpdates map
      expect(getItem(id)?.status).toBe("done");
      expect(getItem(id)?.progress).toBe(100);
    });

    it("marks the item failed and shows a generic error on a plain failure", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("network blip"));
      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      const item = getItem(id)!;
      expect(item.status).toBe("failed");
      expect(item.error).toBe("network blip");
      expect(toast.error).toHaveBeenCalledWith("Download failed: network blip");
      expect(notifications.downloadFailed).toHaveBeenCalledWith("a.bin", "network blip");
    });

    it("falls back to a generic message when a non-Error value is thrown", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValue("boom");
      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.error).toBe("Download failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: Download failed");
    });

    it("leaves a sibling queue item alone when one download succeeds and another fails", async () => {
      (downloadAndDecryptFile as Mock).mockImplementation((fileId: string) =>
        fileId === "file-1" ? Promise.resolve() : Promise.reject(new Error("boom"))
      );
      useDownloadStore.getState().startDownload("file-1", "ok.bin", 10, "pw");
      useDownloadStore.getState().startDownload("file-2", "bad.bin", 10, "pw");
      const [idOk, idBad] = useDownloadStore.getState().queue.map((i) => i.id);
      await flush();

      expect(getItem(idOk)?.status).toBe("done");
      expect(getItem(idBad)?.status).toBe("failed");
      expect(getItem(idBad)?.error).toBe("boom");
    });

    it("does not treat a wrong-key message as recoverable when the file has no known folder", async () => {
      queryClient.setQueryData(qk.files, []); // file-1 isn't in the list at all
      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));
      useDownloadStore.getState().startDownload("file-1", "secret.txt", 10, "vault-pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: Decryption failed — wrong passphrase?");
    });

    it("recovers a protected folder's cached password on a wrong-key failure and re-prompts", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "file-1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");

      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));
      useDownloadStore.getState().startDownload("file-1", "secret.txt", 10, "vault-pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Wrong folder password for secret.txt. Retry to re-enter it.");
    });

    it("does not attempt folder-password recovery when the wrong-key file isn't in a protected folder", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "file-1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: null, pwVerifier: null } } });

      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("Decryption failed — wrong passphrase?"));
      useDownloadStore.getState().startDownload("file-1", "secret.txt", 10, "vault-pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(toast.error).toHaveBeenCalledWith("Download failed: Decryption failed — wrong passphrase?");
    });

    it("does not treat an unrelated failure message as a wrong-key recovery case", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "file-1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");

      (downloadAndDecryptFile as Mock).mockRejectedValue(new Error("connection reset"));
      useDownloadStore.getState().startDownload("file-1", "secret.txt", 10, "vault-pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBe("cached-pw");
      expect(toast.error).toHaveBeenCalledWith("Download failed: connection reset");
    });

    it("cancels an in-flight download and lands it in the cancelled state, not stuck downloading", async () => {
      let capturedSignal: AbortSignal | undefined;
      let rejectDownload: (e: unknown) => void;
      (downloadAndDecryptFile as Mock).mockImplementation((_id, _pp, opts) => {
        capturedSignal = opts.signal;
        return new Promise((_res, rej) => {
          rejectDownload = rej;
        });
      });

      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(capturedSignal!.aborted).toBe(false);
      useDownloadStore.getState().cancelDownload(id);
      expect(capturedSignal!.aborted).toBe(true);

      rejectDownload!(new DOMException("Download cancelled", "AbortError"));
      await flush();

      const item = getItem(id)!;
      expect(item.status).toBe("cancelled");
      expect(item.stage).toBe("Cancelled");
      expect(useDownloadStore.getState().controllers.has(id)).toBe(false);
    });

    it("fires a web notification when the tab is hidden and permission is granted", async () => {
      vi.useFakeTimers();
      const Ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", Ctor);
      setDocumentHidden(true);
      const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});

      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      await flush();

      expect(Ctor.instances).toHaveLength(1);
      const n = Ctor.instances[0];
      expect(n.title).toBe("Download complete");
      expect(n.options).toEqual({ body: "a.bin", icon: "/favicon.ico", tag: "download-done" });

      n.onclick?.();
      expect(focusSpy).toHaveBeenCalled();
      expect(n.close).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5000);
      expect(n.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("startBulkZipDownload", () => {
    const files: BulkDownloadFile[] = [
      { fileId: "f1", filename: "a.txt", fileSize: 100 },
      { fileId: "f2", filename: "b.txt", fileSize: 200 },
    ];

    it("queues a single ZIP item covering all files and completes successfully", async () => {
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const item = useDownloadStore.getState().queue[0];
      expect(item.fileId).toBe("zip");
      expect(item.filename).toBe("2 files as ZIP");
      expect(item.fileSize).toBe(300);

      await flush();
      const [calledFiles, passphrase, options] = (downloadAsZip as Mock).mock.calls[0];
      expect(calledFiles).toBe(files);
      expect(passphrase).toBe("pw");
      expect(options.resolvePassword).toBe(resolveFilePasswordGlobal);

      expect(getItem(item.id)?.status).toBe("done");
      expect(toast.success).toHaveBeenCalledWith("ZIP with 2 files downloaded");
      expect(notifications.downloadComplete).toHaveBeenCalledWith("2 files (ZIP)");
    });

    it("cancels cleanly when aborted mid-zip", async () => {
      let rejectZip: (e: unknown) => void;
      (downloadAsZip as Mock).mockImplementation(
        () =>
          new Promise((_res, rej) => {
            rejectZip = rej;
          })
      );
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      useDownloadStore.getState().cancelDownload(id);
      rejectZip!(new DOMException("cancelled", "AbortError"));
      await flush();

      expect(getItem(id)?.status).toBe("cancelled");
    });

    it("fails with a generic message and no recovery when nothing looks like a wrong-key error", async () => {
      queryClient.setQueryData(qk.files, [file({ id: "f1", folder_id: "folder-1" })]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s", pwVerifier: "v" } } });
      useFolderPasswordStore.getState().set("folder-1", "cached-pw");

      (downloadAsZip as Mock).mockRejectedValue(new Error("Integrity check failed for a.txt"));
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBe("cached-pw");
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: Integrity check failed for a.txt");
    });

    it("falls back to a generic ZIP failure message when a non-Error value is thrown", async () => {
      (downloadAsZip as Mock).mockRejectedValue("boom");
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.error).toBe("ZIP download failed");
      expect(toast.error).toHaveBeenCalledWith("ZIP download failed: ZIP download failed");
    });

    it("recovers every protected folder among the bulk files on a wrong-key failure", async () => {
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: "folder-2" }),
      ]);
      useFolderRegistry.setState({
        byId: {
          "folder-1": { pwSalt: "s1", pwVerifier: "v1" },
          "folder-2": { pwSalt: "s2", pwVerifier: "v2" },
        },
      });
      useFolderPasswordStore.getState().set("folder-1", "pw1");
      useFolderPasswordStore.getState().set("folder-2", "pw2");

      (downloadAsZip as Mock).mockRejectedValue(new Error("Decryption failed for a.txt — wrong passphrase?"));
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(useFolderPasswordStore.getState().get("folder-2")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Wrong folder password in this ZIP. Retry to re-enter it.");
    });

    it("recovers only the protected folders in a ZIP with a mix of protected and unprotected files", async () => {
      queryClient.setQueryData(qk.files, [
        file({ id: "f1", folder_id: "folder-1" }),
        file({ id: "f2", folder_id: null }),
      ]);
      useFolderRegistry.setState({ byId: { "folder-1": { pwSalt: "s1", pwVerifier: "v1" } } });
      useFolderPasswordStore.getState().set("folder-1", "pw1");

      (downloadAsZip as Mock).mockRejectedValue(new Error("Decryption failed for a.txt — wrong passphrase?"));
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      expect(getItem(id)?.status).toBe("failed");
      expect(useFolderPasswordStore.getState().get("folder-1")).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Wrong folder password in this ZIP. Retry to re-enter it.");
    });

    it("plumbs ZIP onProgress callbacks into throttled queue updates", () => {
      vi.useFakeTimers();
      let capturedOpts: { onProgress: (i: { percent: number; stage: string }) => void } | undefined;
      (downloadAsZip as Mock).mockImplementation((_files, _pp, opts) => {
        capturedOpts = opts;
        return new Promise(() => {});
      });
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      vi.advanceTimersByTime(20); // flush "Starting ZIP..."

      capturedOpts!.onProgress({ percent: 33, stage: "Downloading a.txt" });
      vi.advanceTimersByTime(20);

      const item = getItem(id)!;
      expect(item.progress).toBe(33);
      expect(item.stage).toBe("Downloading a.txt");
      expect(item.status).toBe("downloading");
    });

    it("leaves a sibling queue item alone when the ZIP download finishes", async () => {
      useDownloadStore.getState().startDownload("solo-file", "solo.bin", 10, "pw");
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const [soloId, zipId] = useDownloadStore.getState().queue.map((i) => i.id);
      await flush();

      expect(getItem(zipId)?.status).toBe("done");
      expect(getItem(soloId)?.status).toBe("done");
    });

    it("leaves a sibling queue item alone when the ZIP download fails", async () => {
      useDownloadStore.getState().startDownload("solo-file", "solo.bin", 10, "pw");
      (downloadAsZip as Mock).mockRejectedValue(new Error("boom"));
      useDownloadStore.getState().startBulkZipDownload(files, "pw");
      const [soloId, zipId] = useDownloadStore.getState().queue.map((i) => i.id);
      await flush();

      expect(getItem(zipId)?.status).toBe("failed");
      expect(getItem(soloId)?.status).toBe("done");
    });
  });

  describe("cancelDownload", () => {
    it("is a no-op for an unknown id", () => {
      expect(() => useDownloadStore.getState().cancelDownload("does-not-exist")).not.toThrow();
    });
  });

  describe("retryDownload", () => {
    it("removes the old entry and starts a fresh download with the same file details", async () => {
      (downloadAndDecryptFile as Mock).mockRejectedValueOnce(new Error("first try failed"));
      useDownloadStore.getState().startDownload("file-1", "a.bin", 500, "pw");
      const oldId = useDownloadStore.getState().queue[0].id;
      await flush();
      expect(getItem(oldId)?.status).toBe("failed");

      (downloadAndDecryptFile as Mock).mockResolvedValueOnce(undefined);
      useDownloadStore.getState().retryDownload(oldId, "pw2");

      expect(useDownloadStore.getState().queue.find((i) => i.id === oldId)).toBeUndefined();
      expect(useDownloadStore.getState().queue).toHaveLength(1);
      const newItem = useDownloadStore.getState().queue[0];
      expect(newItem.fileId).toBe("file-1");
      expect(newItem.filename).toBe("a.bin");
      expect(newItem.fileSize).toBe(500);

      await flush();
      expect(getItem(newItem.id)?.status).toBe("done");
      expect(downloadAndDecryptFile).toHaveBeenCalledTimes(2);
    });

    it("is a no-op for an unknown id", () => {
      useDownloadStore.getState().retryDownload("does-not-exist", "pw");
      expect(useDownloadStore.getState().queue).toHaveLength(0);
      expect(downloadAndDecryptFile).not.toHaveBeenCalled();
    });
  });

  describe("removeFromQueue", () => {
    it("aborts the controller for an in-flight download and removes it from the queue", async () => {
      (downloadAndDecryptFile as Mock).mockImplementation(() => new Promise(() => {}));
      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();

      const controller = useDownloadStore.getState().controllers.get(id)!;
      expect(controller.signal.aborted).toBe(false);

      useDownloadStore.getState().removeFromQueue(id);

      expect(controller.signal.aborted).toBe(true);
      expect(useDownloadStore.getState().queue.find((i) => i.id === id)).toBeUndefined();
      expect(useDownloadStore.getState().controllers.has(id)).toBe(false);
    });

    it("removes a completed download that no longer has a controller, without throwing", async () => {
      useDownloadStore.getState().startDownload("file-1", "a.bin", 10, "pw");
      const id = useDownloadStore.getState().queue[0].id;
      await flush();
      expect(useDownloadStore.getState().controllers.has(id)).toBe(false);

      expect(() => useDownloadStore.getState().removeFromQueue(id)).not.toThrow();
      expect(useDownloadStore.getState().queue.find((i) => i.id === id)).toBeUndefined();
    });
  });

  describe("clearCompleted", () => {
    it("removes done and cancelled items but keeps failed, downloading, and queued ones", () => {
      useDownloadStore.setState({
        controllers: new Map(),
        queue: [
          { id: "1", fileId: "f", filename: "done.txt", fileSize: 1, status: "done", progress: 100, stage: "Done", startedAt: 0 },
          { id: "2", fileId: "f", filename: "cancelled.txt", fileSize: 1, status: "cancelled", progress: 0, stage: "Cancelled", startedAt: 0 },
          { id: "3", fileId: "f", filename: "failed.txt", fileSize: 1, status: "failed", progress: 0, stage: "Failed", startedAt: 0 },
          { id: "4", fileId: "f", filename: "downloading.txt", fileSize: 1, status: "downloading", progress: 50, stage: "...", startedAt: 0 },
          { id: "5", fileId: "f", filename: "queued.txt", fileSize: 1, status: "queued", progress: 0, stage: "Queued", startedAt: 0 },
        ],
      });

      useDownloadStore.getState().clearCompleted();

      const remainingIds = useDownloadStore.getState().queue.map((i) => i.id);
      expect(remainingIds).toEqual(["3", "4", "5"]);
    });
  });
});
