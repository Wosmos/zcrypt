import { describe, it, expect, beforeEach, vi } from "vitest";

// verifyVaultPassphrase probes ensureFiles()/getFileMeta() and tries to unwrap
// a real file's CEK via resolveFileKey. We keep IncorrectPassphraseError as a
// real class (constructed the same way in the mock and in this test file) so
// the SUT's `instanceof` check works against our thrown errors.
const { getFileMeta, ensureFiles, resolveFileKey, fromBase64, IncorrectPassphraseError } = vi.hoisted(() => {
  class IncorrectPassphraseError extends Error {
    constructor() {
      super("Incorrect passphrase — could not unlock this file.");
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

function file(id: string) {
  return { id } as { id: string };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
