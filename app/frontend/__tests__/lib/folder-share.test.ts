import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  generateCEK,
  resolveFileKey,
  wrapKey,
  toBase64,
  fromBase64,
  createFolderShare,
  getFileMeta,
  listFolderSubtree,
  deriveNameKey,
  decryptNameSafe,
  getAuthState,
  getPassphrase,
} = vi.hoisted(() => ({
  generateCEK: vi.fn(),
  resolveFileKey: vi.fn(),
  wrapKey: vi.fn(),
  toBase64: vi.fn(),
  fromBase64: vi.fn(),
  createFolderShare: vi.fn(),
  getFileMeta: vi.fn(),
  listFolderSubtree: vi.fn(),
  deriveNameKey: vi.fn(),
  decryptNameSafe: vi.fn(),
  getAuthState: vi.fn(),
  getPassphrase: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({ generateCEK, resolveFileKey, wrapKey, toBase64, fromBase64 }));
vi.mock("@/lib/api", () => ({ createFolderShare, getFileMeta, listFolderSubtree }));
vi.mock("@/lib/name-crypto", () => ({ deriveNameKey, decryptNameSafe }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: getAuthState } }));
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
  // DEFAULT: no authenticated user -> the path-building branch is skipped, so
  // every pre-existing test keeps its original flat-share behavior. The nested
  // tests below opt in by returning a user id.
  getAuthState.mockReturnValue({ user: undefined });
  listFolderSubtree.mockResolvedValue([]);
  deriveNameKey.mockResolvedValue({} as CryptoKey);
  decryptNameSafe.mockResolvedValue("Folder");
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

  describe("nested-folder path manifest (folderId + authenticated user)", () => {
    it("walks the subtree, sanitizes segments, and appends a gzipped path manifest", async () => {
      getAuthState.mockReturnValue({ user: { id: "u1" } });
      // Subtree: folder-1 -> sub1 ("Sub Folder") -> sub2 (name decrypts to "."
      // which sanitizeSegment must neutralize to "_").
      listFolderSubtree.mockResolvedValue([
        { id: "folder-1" },
        { id: "sub1", parent_id: "folder-1", encrypted_name: "enc-sub" },
        { id: "sub2", parent_id: "sub1", encrypted_name: "enc-dot" },
      ]);
      decryptNameSafe.mockImplementation(async (enc: string) =>
        enc === "enc-dot" ? "." : "Sub Folder"
      );
      getFileMeta.mockResolvedValue({ wrapped_cek: "w", salt: "s" });
      resolveFileKey.mockResolvedValue(new Uint8Array([7, 7]).buffer);

      const result = await createFolderShareLink(
        "folder-1",
        "My Folder",
        [
          { id: "f1", folder_id: "sub1" },
          { id: "f2", folder_id: "sub2" },
        ]
      );

      expect(deriveNameKey).toHaveBeenCalledWith("correct-horse-battery", "u1");
      expect(listFolderSubtree).toHaveBeenCalledWith("folder-1");
      expect(result.shared).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.nestingIncomplete).toBe(false);
      // The gzipped subfolder manifest rides in the fragment (real fflate gzip,
      // then the mocked toBase64).
      expect(result.url).toContain("#key=b64:1,2,3,4");
      expect(result.url).toContain("&paths=b64:");
    });

    it("puts root-level files (folder_id === shared root) in no manifest, so no &paths is appended", async () => {
      getAuthState.mockReturnValue({ user: { id: "u1" } });
      listFolderSubtree.mockResolvedValue([{ id: "folder-1" }]); // no subfolders
      getFileMeta.mockResolvedValue({ wrapped_cek: "w", salt: "s" });
      resolveFileKey.mockResolvedValue(new Uint8Array([7]).buffer);

      // File sits directly in the shared root.
      const result = await createFolderShareLink("folder-1", "Root", [
        { id: "f1", folder_id: "folder-1" },
      ]);

      expect(result.shared).toBe(1);
      expect(result.url).not.toContain("&paths=");
    });

    it("flags nestingIncomplete when the subtree can't load but subfolder files exist", async () => {
      getAuthState.mockReturnValue({ user: { id: "u1" } });
      listFolderSubtree.mockRejectedValue(new Error("subtree fetch failed"));
      getFileMeta.mockResolvedValue({ wrapped_cek: "w", salt: "s" });
      resolveFileKey.mockResolvedValue(new Uint8Array([7]).buffer);

      const result = await createFolderShareLink("folder-1", "F", [
        { id: "f1", folder_id: "sub-x" }, // a subfolder file (folder_id !== root)
      ]);

      expect(result.nestingIncomplete).toBe(true);
      expect(result.shared).toBe(1);
      // Path build failed -> no manifest -> flat link.
      expect(result.url).not.toContain("&paths=");
    });
  });
});
