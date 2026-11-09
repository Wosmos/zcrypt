import { describe, it, expect, vi } from "vitest";

const { setFileName } = vi.hoisted(() => ({
  setFileName: vi.fn(async (_id: string, _name: string) => ({ success: true })),
}));

vi.mock("@/lib/api", () => ({ setFileName, renameFolder: vi.fn(), listPk1Folders: async () => [] }));
vi.mock("@/store/files", () => ({
  ensureFiles: async () => [{ id: "f1", encrypted_name: "pk1:photo" }],
  prefetchFileList: vi.fn(),
}));
vi.mock("@/lib/sealed", () => ({ userNameKey: async () => ({}) as CryptoKey }));
vi.mock("@/lib/pk1", () => ({ isPk1: () => true, openPk1Name: async () => "photo.jpg" }));
vi.mock("@/lib/name-crypto", () => ({
  encryptName: async () => "sealed",
  decryptName: async () => "something else",
}));

import { adoptBackupNames } from "@/lib/pk1-adopt";

describe("adoptBackupNames verification", () => {
  it("never writes a re-sealed name that doesn't decrypt back to the original", async () => {
    expect(await adoptBackupNames()).toEqual({ adopted: 0, skipped: 1 });
    expect(setFileName).not.toHaveBeenCalled();
  });
});
