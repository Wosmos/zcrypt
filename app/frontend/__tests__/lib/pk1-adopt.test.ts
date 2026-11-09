import { describe, it, expect, beforeEach, vi } from "vitest";

const { setFileName, renameFolder, listPk1Folders, ensureFiles, prefetchFileList, keyRef } = vi.hoisted(() => ({
  setFileName: vi.fn(async (_id: string, _name: string) => ({ success: true })),
  renameFolder: vi.fn(async (_id: string, _name: string) => ({ success: true })),
  listPk1Folders: vi.fn(),
  ensureFiles: vi.fn(),
  prefetchFileList: vi.fn(async (_force?: boolean) => {}),
  keyRef: { current: null as CryptoKey | null },
}));

vi.mock("@/lib/api", () => ({ setFileName, renameFolder, listPk1Folders }));
vi.mock("@/store/files", () => ({ ensureFiles, prefetchFileList }));
vi.mock("@/lib/sealed", () => ({ userNameKey: async () => keyRef.current }));
vi.mock("@/lib/pk1", () => ({
  isPk1: (v?: string | null) => !!v && v.startsWith("pk1:"),
  openPk1Name: async (v: string) => {
    if (v === "pk1:broken") throw new Error("cannot open");
    return v.slice(4).toUpperCase();
  },
}));

import { adoptBackupNames } from "@/lib/pk1-adopt";
import { decryptName } from "@/lib/name-crypto";

beforeEach(async () => {
  vi.clearAllMocks();
  keyRef.current = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  listPk1Folders.mockResolvedValue([{ id: "fold1", encrypted_name: "pk1:backups" }]);
  ensureFiles.mockResolvedValue([
    { id: "f1", encrypted_name: "pk1:photo.jpg" },
    { id: "f2", encrypted_name: "normalCiphertext" },
    { id: "f3", encrypted_name: "pk1:gone.jpg", deleted_at: "2026-11-01" },
    { id: "f4", encrypted_name: "pk1:broken" },
  ]);
});

describe("adoptBackupNames", () => {
  it("re-seals backup names with the name key, verified, and skips what it can't open", async () => {
    const result = await adoptBackupNames();
    expect(result).toEqual({ adopted: 2, skipped: 1 });
    expect(setFileName).toHaveBeenCalledTimes(1);
    expect(renameFolder).toHaveBeenCalledTimes(1);
    const [fileId, sealed] = setFileName.mock.calls[0];
    expect(fileId).toBe("f1");
    expect(sealed.startsWith("pk1:")).toBe(false);
    expect(await decryptName(sealed, keyRef.current as CryptoKey)).toBe("PHOTO.JPG");
    expect(prefetchFileList).toHaveBeenCalledWith(true);
  });

  it("does nothing while the vault is locked", async () => {
    keyRef.current = null;
    expect(await adoptBackupNames()).toEqual({ adopted: 0, skipped: 0 });
    expect(setFileName).not.toHaveBeenCalled();
  });

  it("stops when asked", async () => {
    expect(await adoptBackupNames(() => true)).toEqual({ adopted: 0, skipped: 0 });
    expect(setFileName).not.toHaveBeenCalled();
  });
});
