import { describe, it, expect, beforeEach, vi } from "vitest";

// verifyVaultPassphrase probes ensureFiles()/getFileMeta() and tries to unwrap
// a real file's CEK via resolveFileKey. We keep IncorrectPassphraseError as a
// real class (constructed the same way in the mock and in this test file) so
// the SUT's `instanceof` check works against our thrown errors.
const { getFileMeta, ensureFiles, resolveFileKey, fromBase64, IncorrectPassphraseError } = vi.hoisted(() => {
  class IncorrectPassphraseError extends Error {
    constructor() {
      super("Incorrect passphrase: could not unlock this file.");
      this.name = "IncorrectPassphraseError";
    }
  }
  return {
    getFileMeta: vi.fn(),
    ensureFiles: vi.fn(),
    resolveFileKey: vi.fn(),
    fromBase64: vi.fn((s: string) => new Uint8Array([s.length])),
    IncorrectPassphraseError,
  };
});

vi.mock("@/lib/api", () => ({ getFileMeta }));
vi.mock("@/store/files", () => ({ ensureFiles }));
vi.mock("@/lib/crypto", () => ({ resolveFileKey, fromBase64, IncorrectPassphraseError }));

import { verifyVaultPassphrase } from "@/lib/vault-verify";
import { useFolderRegistry } from "@/store/folder-registry";
import type { Folder } from "@/types";

function file(id: string, folder_id: string | null = null) {
  return { id, folder_id } as { id: string; folder_id: string | null };
}

beforeEach(() => {
  vi.clearAllMocks();
  getFileMeta.mockReset();
  useFolderRegistry.setState({ byId: {} });
});

describe("verifyVaultPassphrase", () => {
  it("returns true (inconclusive) when the vault is empty", async () => {
    ensureFiles.mockResolvedValueOnce([]);

    expect(await verifyVaultPassphrase("pw")).toBe(true);
    expect(getFileMeta).not.toHaveBeenCalled();
  });

  it("returns true (inconclusive) when listing files fails", async () => {
    ensureFiles.mockRejectedValueOnce(new Error("network down"));

    expect(await verifyVaultPassphrase("pw")).toBe(true);
    expect(getFileMeta).not.toHaveBeenCalled();
  });

  it("returns true when the first envelope file's CEK unwraps successfully", async () => {
    ensureFiles.mockResolvedValueOnce([file("f1")]);
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "wrapped", salt: "salt" });
    resolveFileKey.mockResolvedValueOnce(new ArrayBuffer(32));

    expect(await verifyVaultPassphrase("correct-pw")).toBe(true);
    expect(resolveFileKey).toHaveBeenCalledTimes(1);
    expect(resolveFileKey).toHaveBeenCalledWith("correct-pw", expect.any(Uint8Array), "wrapped");
  });

  it("returns false when resolveFileKey throws IncorrectPassphraseError", async () => {
    ensureFiles.mockResolvedValueOnce([file("f1")]);
    getFileMeta.mockResolvedValueOnce({ wrapped_cek: "wrapped", salt: "salt" });
    resolveFileKey.mockRejectedValueOnce(new IncorrectPassphraseError());

    expect(await verifyVaultPassphrase("wrong-pw")).toBe(false);
  });

  it("skips legacy files with no wrapped_cek and checks the next candidate", async () => {
    ensureFiles.mockResolvedValueOnce([file("legacy"), file("envelope")]);
    getFileMeta
      .mockResolvedValueOnce({ wrapped_cek: undefined, salt: "s1" })
      .mockResolvedValueOnce({ wrapped_cek: "w2", salt: "s2" });
    resolveFileKey.mockResolvedValueOnce(new ArrayBuffer(32));

    expect(await verifyVaultPassphrase("pw")).toBe(true);
    expect(resolveFileKey).toHaveBeenCalledTimes(1);
  });

  it("moves to the next candidate on a non-passphrase error (e.g. network)", async () => {
    ensureFiles.mockResolvedValueOnce([file("a"), file("b")]);
    getFileMeta
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({ wrapped_cek: "w2", salt: "s2" });
    resolveFileKey.mockResolvedValueOnce(new ArrayBuffer(32));

    expect(await verifyVaultPassphrase("pw")).toBe(true);
  });

  it("probes at most the first 5 files and returns true (inconclusive) if none are verifiable", async () => {
    const files = Array.from({ length: 8 }, (_, i) => file(`f${i}`));
    ensureFiles.mockResolvedValueOnce(files);
    getFileMeta.mockResolvedValue({ wrapped_cek: undefined, salt: "s" }); // all legacy

    expect(await verifyVaultPassphrase("pw")).toBe(true);
    expect(getFileMeta).toHaveBeenCalledTimes(5); // slice(0, 5)
  });

  it("fetches candidates in parallel and skips one whose metadata fails to load", async () => {
    ensureFiles.mockResolvedValueOnce([file("a"), file("b")]);
    getFileMeta
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockResolvedValueOnce(new Uint8Array(32));
    await expect(verifyVaultPassphrase("pp")).resolves.toBe(true);
    expect(getFileMeta).toHaveBeenCalledTimes(2);
  });

  it("a later success outweighs a rejection from a folder of unknown protection", async () => {
    ensureFiles.mockResolvedValueOnce([file("a", "unknown-folder"), file("b", "other-folder")]);
    getFileMeta.mockResolvedValue({ salt: "s", wrapped_cek: "w" });
    resolveFileKey
      .mockRejectedValueOnce(new IncorrectPassphraseError())
      .mockResolvedValueOnce(new Uint8Array(32));
    await expect(verifyVaultPassphrase("pp")).resolves.toBe(true);
  });

  it("an odd unwrap error is inconclusive, not a rejection", async () => {
    ensureFiles.mockResolvedValueOnce([file("a")]);
    getFileMeta.mockResolvedValueOnce({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockRejectedValueOnce(new Error("malformed envelope"));
    await expect(verifyVaultPassphrase("pp")).resolves.toBe(true);
  });

  it("returns false on the first rejection of a root file, with one derivation", async () => {
    ensureFiles.mockResolvedValueOnce([file("a"), file("b"), file("c")]);
    getFileMeta.mockResolvedValue({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockRejectedValue(new IncorrectPassphraseError());
    await expect(verifyVaultPassphrase("wrong")).resolves.toBe(false);
    expect(resolveFileKey).toHaveBeenCalledTimes(1);
  });

  it("treats a rejection from a known-unprotected folder as conclusive", async () => {
    useFolderRegistry.getState().record([{ id: "open", pw_salt: null } as Folder]);
    ensureFiles.mockResolvedValueOnce([file("a", "open"), file("b", "open")]);
    getFileMeta.mockResolvedValue({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockRejectedValue(new IncorrectPassphraseError());
    await expect(verifyVaultPassphrase("wrong")).resolves.toBe(false);
    expect(resolveFileKey).toHaveBeenCalledTimes(1);
  });

  it("skips files in known-protected folders and tests root files first", async () => {
    useFolderRegistry.getState().record([{ id: "locked", pw_salt: "salt" } as Folder]);
    ensureFiles.mockResolvedValueOnce([file("p", "locked"), file("u", "unknown"), file("r")]);
    getFileMeta.mockResolvedValue({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockRejectedValue(new IncorrectPassphraseError());
    await expect(verifyVaultPassphrase("wrong")).resolves.toBe(false);
    expect(getFileMeta.mock.calls.map((c) => c[0])).toEqual(["r", "u"]);
    expect(resolveFileKey).toHaveBeenCalledTimes(1);
  });

  it("keeps probing past rejections from unknown folders before reporting wrong", async () => {
    ensureFiles.mockResolvedValueOnce([file("a", "x"), file("b", "y")]);
    getFileMeta.mockResolvedValue({ salt: "s", wrapped_cek: "w" });
    resolveFileKey.mockRejectedValue(new IncorrectPassphraseError());
    await expect(verifyVaultPassphrase("pp")).resolves.toBe(false);
    expect(resolveFileKey).toHaveBeenCalledTimes(2);
  });
});
