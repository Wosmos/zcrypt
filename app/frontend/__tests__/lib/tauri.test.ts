import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock, save: saveMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

describe("tauri (outside the Tauri runtime)", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    listenMock.mockReset();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("isTauri is false", async () => {
    const mod = await import("@/lib/tauri");
    expect(mod.isTauri).toBe(false);
  });

  it("tauriInvoke rejects instead of touching the Tauri bridge", async () => {
    const mod = await import("@/lib/tauri");
    await expect(mod.tauriInvoke("x")).rejects.toThrow(
      "tauriInvoke called outside Tauri runtime"
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("pickFiles resolves to an empty array without opening a dialog", async () => {
    const mod = await import("@/lib/tauri");
    await expect(mod.pickFiles()).resolves.toEqual([]);
    expect(openMock).not.toHaveBeenCalled();
  });

  it("pickSaveLocation resolves to null without opening a dialog", async () => {
    const mod = await import("@/lib/tauri");
    await expect(mod.pickSaveLocation("f.txt")).resolves.toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("subscribeProgress resolves a no-op unlisten without touching the event bridge", async () => {
    const mod = await import("@/lib/tauri");
    const unlisten = await mod.subscribeProgress(() => {});
    expect(listenMock).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });
});

describe("tauri (inside the Tauri runtime)", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    listenMock.mockReset();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("isTauri is true", async () => {
    const mod = await import("@/lib/tauri");
    expect(mod.isTauri).toBe(true);
  });

  it("tauriInvoke delegates to @tauri-apps/api/core invoke()", async () => {
    invokeMock.mockResolvedValue("ok");
    const mod = await import("@/lib/tauri");
    await expect(mod.tauriInvoke("cmd", { a: 1 })).resolves.toBe("ok");
    expect(invokeMock).toHaveBeenCalledWith("cmd", { a: 1 });
  });

  it("pickFiles returns [] when the dialog is cancelled", async () => {
    openMock.mockResolvedValue(null);
    const mod = await import("@/lib/tauri");
    await expect(mod.pickFiles()).resolves.toEqual([]);
    expect(openMock).toHaveBeenCalledWith({
      multiple: true,
      title: "Select files to upload",
    });
  });

  it("pickFiles passes an array result straight through", async () => {
    openMock.mockResolvedValue(["/a", "/b"]);
    const mod = await import("@/lib/tauri");
    await expect(
      mod.pickFiles({ multiple: true, title: "Pick" })
    ).resolves.toEqual(["/a", "/b"]);
    expect(openMock).toHaveBeenCalledWith({ multiple: true, title: "Pick" });
  });

  it("pickFiles wraps a single string result in an array", async () => {
    openMock.mockResolvedValue("/single");
    const mod = await import("@/lib/tauri");
    await expect(mod.pickFiles()).resolves.toEqual(["/single"]);
  });

  it("pickSaveLocation delegates to save()", async () => {
    saveMock.mockResolvedValue("/save/path");
    const mod = await import("@/lib/tauri");
    await expect(mod.pickSaveLocation("file.bin")).resolves.toBe(
      "/save/path"
    );
    expect(saveMock).toHaveBeenCalledWith({ defaultPath: "file.bin" });
  });

  it("sidecarUpload invokes upload_file with filePath/passphrase/platform", async () => {
    const mod = await import("@/lib/tauri");
    await mod.sidecarUpload("/f", "pw", "github");
    expect(invokeMock).toHaveBeenCalledWith("upload_file", {
      filePath: "/f",
      passphrase: "pw",
      platform: "github",
    });
  });

  it("localUpload defaults profile to 'normal'", async () => {
    invokeMock.mockResolvedValue("local-id-1");
    const mod = await import("@/lib/tauri");
    await expect(mod.localUpload("/f", "pw")).resolves.toBe("local-id-1");
    expect(invokeMock).toHaveBeenCalledWith("local_upload", {
      filePath: "/f",
      passphrase: "pw",
      profile: "normal",
    });
  });

  it("localUpload passes an explicit profile through", async () => {
    const mod = await import("@/lib/tauri");
    await mod.localUpload("/f", "pw", "turbo");
    expect(invokeMock).toHaveBeenCalledWith("local_upload", {
      filePath: "/f",
      passphrase: "pw",
      profile: "turbo",
    });
  });

  it("startSync invokes start_sync with baseUrl/accessToken/refreshToken", async () => {
    const mod = await import("@/lib/tauri");
    await mod.startSync("https://x", "tok", "refresh-tok");
    expect(invokeMock).toHaveBeenCalledWith("start_sync", {
      baseUrl: "https://x",
      accessToken: "tok",
      refreshToken: "refresh-tok",
    });
  });

  it("stopSync invokes stop_sync", async () => {
    const mod = await import("@/lib/tauri");
    await mod.stopSync();
    expect(invokeMock).toHaveBeenCalledWith("stop_sync", undefined);
  });

  it("getSyncStatus invokes sync_status and returns the stats", async () => {
    const stats = {
      pending_files: 1,
      syncing_files: 2,
      synced_files: 3,
      error_files: 0,
    };
    invokeMock.mockResolvedValue(stats);
    const mod = await import("@/lib/tauri");
    await expect(mod.getSyncStatus()).resolves.toEqual(stats);
    expect(invokeMock).toHaveBeenCalledWith("sync_status", undefined);
  });

  it("getEngineStatus invokes get_engine_status and returns the status", async () => {
    const status = { ready: true, version: "1.2.3" };
    invokeMock.mockResolvedValue(status);
    const mod = await import("@/lib/tauri");
    await expect(mod.getEngineStatus()).resolves.toEqual(status);
    expect(invokeMock).toHaveBeenCalledWith("get_engine_status", undefined);
  });

  it("sidecarDownload invokes download_file with fileId/passphrase/userId/savePath", async () => {
    const mod = await import("@/lib/tauri");
    await mod.sidecarDownload("id1", "pw", "user1", "/save");
    expect(invokeMock).toHaveBeenCalledWith("download_file", {
      fileId: "id1",
      passphrase: "pw",
      userId: "user1",
      savePath: "/save",
    });
  });

  it("keychainSet invokes keychain_set with key/value", async () => {
    const mod = await import("@/lib/tauri");
    await mod.keychainSet("k", "v");
    expect(invokeMock).toHaveBeenCalledWith("keychain_set", { key: "k", value: "v" });
  });

  it("keychainGet invokes keychain_get and returns the value", async () => {
    invokeMock.mockResolvedValue("v");
    const mod = await import("@/lib/tauri");
    await expect(mod.keychainGet("k")).resolves.toBe("v");
    expect(invokeMock).toHaveBeenCalledWith("keychain_get", { key: "k" });
  });

  it("keychainDelete invokes keychain_delete with key", async () => {
    const mod = await import("@/lib/tauri");
    await mod.keychainDelete("k");
    expect(invokeMock).toHaveBeenCalledWith("keychain_delete", { key: "k" });
  });

  it("checkForUpdates invokes check_for_updates and returns the result", async () => {
    invokeMock.mockResolvedValue({ available: false });
    const mod = await import("@/lib/tauri");
    await expect(mod.checkForUpdates()).resolves.toEqual({ available: false });
    expect(invokeMock).toHaveBeenCalledWith("check_for_updates", undefined);
  });

  it("subscribeProgress listens on zcrypt://progress and forwards payloads", async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation((_event: string, cb: (event: { payload: unknown }) => void) => {
      handler = cb;
      return Promise.resolve(() => {});
    });
    const mod = await import("@/lib/tauri");
    const cb = vi.fn();
    const unlisten = await mod.subscribeProgress(cb);
    expect(listenMock).toHaveBeenCalledWith("zcrypt://progress", expect.any(Function));

    const payload = {
      file_id: "f1",
      file_name: "a.txt",
      stage: "uploading",
      chunks_done: 1,
      chunks_total: 2,
      bytes_done: 10,
      bytes_total: 20,
      speed: 5,
    };
    handler?.({ payload });
    expect(cb).toHaveBeenCalledWith(payload);
    expect(typeof unlisten).toBe("function");
  });
});
