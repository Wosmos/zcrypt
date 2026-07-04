import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  generateCEK,
  resolveFileKey,
  wrapKey,
  toBase64,
  fromBase64,
  createFolderShare,
  getFileMeta,
  getPassphrase,
} = vi.hoisted(() => ({
  generateCEK: vi.fn(),
  resolveFileKey: vi.fn(),
  wrapKey: vi.fn(),
  toBase64: vi.fn(),
  fromBase64: vi.fn(),
  createFolderShare: vi.fn(),
  getFileMeta: vi.fn(),
  getPassphrase: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({ generateCEK, resolveFileKey, wrapKey, toBase64, fromBase64 }));
vi.mock("@/lib/api", () => ({ createFolderShare, getFileMeta }));
vi.mock("@/store/passphrase", () => ({ usePassphraseStore: { getState: () => ({ getPassphrase }) } }));

import { createFolderShareLink } from "@/lib/folder-share";

beforeEach(() => {
  vi.clearAllMocks();
  getPassphrase.mockReturnValue("correct-horse-battery");
  generateCEK.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
  fromBase64.mockImplementation((s: string) => new Uint8Array([s.length]));
  toBase64.mockImplementation((u8: Uint8Array) => `b64:${Array.from(u8).join(",")}`);
  wrapKey.mockImplementation(async (_kek: ArrayBuffer, cek: Uint8Array) => new Uint8Array([...cek, 9]));
  createFolderShare.mockResolvedValue({ id: "share-1", token: "tok123" });
});

describe("createFolderShareLink", () => {
  it("throws when the vault is locked (no cached passphrase)", async () => {
    getPassphrase.mockReturnValue(null);

    await expect(createFolderShareLink(null, "Folder", [{ id: "f1" }])).rejects.toThrow(
      "Unlock your vault to share a folder."
    );
    expect(getFileMeta).not.toHaveBeenCalled();
  });

  it("throws when there are no files to share", async () => {
    await expect(createFolderShareLink(null, "Folder", [])).rejects.toThrow(
      "This folder has no files to share."
    );
  });

  it("wraps each file's CEK under the folder key and returns the share URL", async () => {
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "w1", salt: "s1" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array([7, 7]).buffer);

    const result = await createFolderShareLink("folder-1", "My Folder", [{ id: "f1" }]);

    expect(result.shared).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.token).toBe("tok123");
    expect(result.url).toBe(`${window.location.origin}/f/tok123#key=b64:1,2,3,4`);
    expect(resolveFileKey).toHaveBeenCalledWith("correct-horse-battery", expect.any(Uint8Array), "w1");
    expect(createFolderShare).toHaveBeenCalledWith({
      folder_id: "folder-1",
      name: "My Folder",
      files: [{ file_id: "f1", wrapped_cek: "b64:7,7,9" }],
      password: undefined,
      expires_in_hours: undefined,
      max_downloads: undefined,
    });
  });

  it("passes folder_id as undefined when folderId is null", async () => {
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "w1", salt: "s1" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array([1]).buffer);

    await createFolderShareLink(null, "Root files", [{ id: "f1" }]);

    expect(createFolderShare).toHaveBeenCalledWith(expect.objectContaining({ folder_id: undefined }));
  });

  it("passes through password, expiresHours, and maxDownloads when given", async () => {
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "w1", salt: "s1" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array([1]).buffer);

    await createFolderShareLink("f", "Name", [{ id: "f1" }], {
      password: "secret",
      expiresHours: 24,
      maxDownloads: 5,
    });

    expect(createFolderShare).toHaveBeenCalledWith(
      expect.objectContaining({ password: "secret", expires_in_hours: 24, max_downloads: 5 })
    );
  });

  it("skips legacy files with no wrapped_cek and tallies them", async () => {
    getFileMeta
      .mockResolvedValueOnce({ wrapped_cek: undefined, salt: "s1" })
      .mockResolvedValueOnce({ wrapped_cek: "w2", salt: "s2" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array([2]).buffer);

    const result = await createFolderShareLink(null, "F", [{ id: "legacy" }, { id: "ok" }]);

    expect(result.shared).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("skips files whose CEK can't be resolved (e.g. password-protected folder) and tallies them", async () => {
    getFileMeta
      .mockResolvedValueOnce({ wrapped_cek: "w1", salt: "s1" })
      .mockResolvedValueOnce({ wrapped_cek: "w2", salt: "s2" });
    resolveFileKey
      .mockRejectedValueOnce(new Error("wrong key"))
      .mockResolvedValueOnce(new Uint8Array([3]).buffer);

    const result = await createFolderShareLink(null, "F", [{ id: "protected" }, { id: "ok" }]);

    expect(result.shared).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("throws a descriptive error when none of the files could be shared", async () => {
    getFileMeta.mockResolvedValue({ wrapped_cek: undefined, salt: "s" });

    await expect(createFolderShareLink(null, "F", [{ id: "a" }, { id: "b" }])).rejects.toThrow(
      /None of this folder's files could be shared/
    );
    expect(createFolderShare).not.toHaveBeenCalled();
  });

  it("counts a getFileMeta failure as skipped too", async () => {
    getFileMeta.mockRejectedValueOnce(new Error("network"));
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "w2", salt: "s2" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array([4]).buffer);

    const result = await createFolderShareLink(null, "F", [{ id: "bad" }, { id: "ok" }]);

    expect(result.shared).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
