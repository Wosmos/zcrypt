import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock, save: saveMock }));

describe("tauri (outside the Tauri runtime)", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
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
});

describe("tauri (inside the Tauri runtime)", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
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

  it("sidecarUpload invokes upload_file with filePath/passphrase", async () => {
    const mod = await import("@/lib/tauri");
    await mod.sidecarUpload("/f", "pw");
    expect(invokeMock).toHaveBeenCalledWith("upload_file", {
      filePath: "/f",
      passphrase: "pw",
    });
  });

  it("localUpload defaults profile to 'normal'", async () => {
    const mod = await import("@/lib/tauri");
    await mod.localUpload("/f", "pw");
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

  it("startSync invokes start_sync with baseUrl/token", async () => {
    const mod = await import("@/lib/tauri");
    await mod.startSync("https://x", "tok");
    expect(invokeMock).toHaveBeenCalledWith("start_sync", {
      baseUrl: "https://x",
      token: "tok",
    });
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

  it("sidecarDownload invokes download_file with fileId/passphrase/savePath", async () => {
    const mod = await import("@/lib/tauri");
    await mod.sidecarDownload("id1", "pw", "/save");
    expect(invokeMock).toHaveBeenCalledWith("download_file", {
      fileId: "id1",
      passphrase: "pw",
      savePath: "/save",
    });
  });
});
