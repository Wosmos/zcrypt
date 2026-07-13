import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

const { getFileMeta, getFileChunk } = vi.hoisted(() => ({
  getFileMeta: vi.fn(),
  getFileChunk: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getFileMeta, getFileChunk }));

const { resolveFileKey, fromBase64, deriveDedupKeyBytes } = vi.hoisted(() => ({
  resolveFileKey: vi.fn(),
  fromBase64: vi.fn(),
  deriveDedupKeyBytes: vi.fn(),
}));
vi.mock("@/lib/crypto", async () => {
  // Provide a REAL sha256 incremental hasher for createContentHasher so the
  // legacy ('plain') integrity path matches the expected hash computed with
  // nobleSha256. The 'hmac_v1' path is exercised too, but createContentHasher
  // here always hashes with sha256 (ignoring scheme), so hmac_v1 fixtures just
  // set their sha256 to the sha256 of the plaintext.
  const { sha256 } = await import("@noble/hashes/sha2.js");
  return {
    resolveFileKey,
    fromBase64,
    deriveDedupKeyBytes,
    createContentHasher: async () => {
      const h = sha256.create();
      return { update: (d: Uint8Array) => h.update(d), digest: () => h.digest() };
    },
    bytesToHex: (bytes: Uint8Array) =>
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
  };
});

// download-session lazily imports these; mock so no real store/module loads and
// the owner-path name/MAC branches are controllable. Existing tests never reach
// the lazy imports, so this is inert for them.
const { getUser, getVaultPass, deriveNameKey, decryptName } = vi.hoisted(() => ({
  getUser: vi.fn<() => { id: string } | undefined>(() => undefined),
  getVaultPass: vi.fn<() => string | null>(() => null),
  deriveNameKey: vi.fn(),
  decryptName: vi.fn(),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: () => ({ user: getUser() }) } }));
vi.mock("@/store/passphrase", () => ({ usePassphraseStore: { getState: () => ({ getPassphrase: getVaultPass }) } }));
vi.mock("@/lib/name-crypto", () => ({ deriveNameKey, decryptName }));

const { getDeviceProfile } = vi.hoisted(() => ({ getDeviceProfile: vi.fn() }));
vi.mock("@/lib/device-profile", () => ({ getDeviceProfile }));

// WorkerPool spins up real Web Workers, which don't exist in jsdom. Fake it
// with an identity "decrypt" (echoes the encrypted bytes back as plaintext) so
// tests exercise download-session's own orchestration, not worker plumbing.
const { processMock, terminateMock, WorkerPoolCtor } = vi.hoisted(() => {
  const processMock = vi.fn(async (input: { encrypted: ArrayBuffer }) => ({ plaintext: input.encrypted }));
  const terminateMock = vi.fn();
  class WorkerPoolCtor {
    process = processMock;
    terminate = terminateMock;
  }
  return { processMock, terminateMock, WorkerPoolCtor };
});
vi.mock("@/lib/worker-pool", () => ({ WorkerPool: WorkerPoolCtor }));

import { downloadAndDecryptFile, type DiskWritable } from "@/lib/download-session";

function chunkBytes(i: number, len = 4): Uint8Array {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = (i * 7 + j) % 256;
  return b;
}

function expectedHash(chunks: Uint8Array[]): string {
  const hasher = nobleSha256.create();
  for (const c of chunks) hasher.update(c);
  return Array.from(hasher.digest())
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function baseMeta(chunkCount: number, sha256: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    original_name: "file.bin",
    original_size: chunkCount * 4,
    compressed_size: chunkCount * 4,
    encrypted_size: chunkCount * 4,
    chunk_count: chunkCount,
    sha256,
    salt: "c2FsdA==",
    wrapped_cek: "d3JhcHBlZA==",
    status: "ready",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function fakeDiskWritable(): DiskWritable & { written: Uint8Array[] } {
  const written: Uint8Array[] = [];
  return {
    written,
    write: vi.fn(async (d: Uint8Array) => {
      written.push(d);
    }),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  resolveFileKey.mockResolvedValue(new ArrayBuffer(32));
  fromBase64.mockReturnValue(new Uint8Array(32));
  getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 2 });
  processMock.mockImplementation(async (input: { encrypted: ArrayBuffer }) => ({ plaintext: input.encrypted }));
  terminateMock.mockImplementation(() => {});
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock-url"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("downloadAndDecryptFile — in-memory path", () => {
  it("downloads, decrypts, verifies integrity, and triggers a Blob download", async () => {
    const chunks = [chunkBytes(0), chunkBytes(1)];
    const hash = expectedHash(chunks);
    getFileMeta.mockResolvedValueOnce(baseMeta(2, hash, { original_name: "report.pdf" }));
    getFileChunk.mockImplementation(async (_id: string, index: number) => ({
      data: chunks[index].buffer,
      sha256: "",
      compressed: false,
    }));

    const stages: string[] = [];
    const onProgress = vi.fn((info: { stage: string }) => stages.push(info.stage));
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw", { onProgress });

    expect(stages[0]).toBe("Fetching metadata...");
    expect(stages).toContain("Verifying integrity...");
    expect(stages[stages.length - 1]).toBe("Done");

    const anchorCall = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect(anchorCall).toBeTruthy();
    expect((anchorCall!.value as HTMLAnchorElement).download).toBe("report.pdf");
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("derives a per-user keyed MAC for an hmac_v1 file on the owner (passphrase) path", async () => {
    const chunks = [chunkBytes(0), chunkBytes(1)];
    getFileMeta.mockResolvedValueOnce(
      baseMeta(2, expectedHash(chunks), { sha256_scheme: "hmac_v1", original_name: "keyed.bin" })
    );
    getFileChunk.mockImplementation(async (_id: string, index: number) => ({
      data: chunks[index].buffer,
      sha256: "",
      compressed: false,
    }));
    getUser.mockReturnValue({ id: "u1" });
    deriveDedupKeyBytes.mockResolvedValue(new Uint8Array(32));

    await downloadAndDecryptFile("f1", "pw");

    // The passphrase path exposes dedupPassphrase, so the MAC key is derived. (lines 191-193)
    expect(deriveDedupKeyBytes).toHaveBeenCalledWith("pw", "u1");
  });

  it("skips the file-level MAC compare for an hmac_v1 file when not signed in (relies on per-chunk tags)", async () => {
    const chunks = [chunkBytes(0)];
    // A wrong file hash would normally throw, but with no user the MAC key can't
    // be derived → canVerifyHash is false → the file-hash compare is skipped.
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "0".repeat(64), { sha256_scheme: "hmac_v1", original_name: "k.bin" }));
    getFileChunk.mockResolvedValueOnce({ data: chunks[0].buffer, sha256: "", compressed: false });
    getUser.mockReturnValue(undefined); // uid falsy → macKey stays undefined

    await expect(downloadAndDecryptFile("f1", "pw")).resolves.toBeUndefined();
    expect(deriveDedupKeyBytes).not.toHaveBeenCalled();
  });

  it("decrypts a zero-knowledge file's encrypted_name to use as the save filename", async () => {
    const chunks = [chunkBytes(0)];
    getFileMeta.mockResolvedValueOnce(
      baseMeta(1, expectedHash(chunks), { original_name: "", encrypted_name: "ENCNAME" })
    );
    getFileChunk.mockResolvedValueOnce({ data: chunks[0].buffer, sha256: "", compressed: false });
    getUser.mockReturnValue({ id: "u1" });
    getVaultPass.mockReturnValue("vaultpass");
    deriveNameKey.mockResolvedValue({} as CryptoKey);
    decryptName.mockResolvedValue("Secret Report.pdf");
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw");

    const anchor = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchor!.value as HTMLAnchorElement).download).toBe("Secret Report.pdf");
    expect(decryptName).toHaveBeenCalledWith("ENCNAME", expect.anything());
  });

  it("falls back to original_name when decrypting the save name throws", async () => {
    const chunks = [chunkBytes(0)];
    getFileMeta.mockResolvedValueOnce(
      baseMeta(1, expectedHash(chunks), { original_name: "fallback.bin", encrypted_name: "ENC" })
    );
    getFileChunk.mockResolvedValueOnce({ data: chunks[0].buffer, sha256: "", compressed: false });
    getUser.mockReturnValue({ id: "u1" });
    getVaultPass.mockReturnValue("vaultpass");
    deriveNameKey.mockResolvedValue({} as CryptoKey);
    decryptName.mockRejectedValue(new Error("wrong key"));
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw");

    const anchor = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchor!.value as HTMLAnchorElement).download).toBe("fallback.bin");
  });

  it("uses a generic 'download' filename when the file carries no name at all", async () => {
    const chunks = [chunkBytes(0)];
    getFileMeta.mockResolvedValueOnce(baseMeta(1, expectedHash(chunks), { original_name: "" }));
    getFileChunk.mockResolvedValueOnce({ data: chunks[0].buffer, sha256: "", compressed: false });
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw");

    const anchor = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchor!.value as HTMLAnchorElement).download).toBe("download"); // saveName || "download"
  });

  it("does not attempt name decryption for an encrypted_name file when the vault is locked", async () => {
    const chunks = [chunkBytes(0)];
    getFileMeta.mockResolvedValueOnce(
      baseMeta(1, expectedHash(chunks), { original_name: "locked.bin", encrypted_name: "ENC" })
    );
    getFileChunk.mockResolvedValueOnce({ data: chunks[0].buffer, sha256: "", compressed: false });
    getUser.mockReturnValue({ id: "u1" });
    getVaultPass.mockReturnValue(null); // locked → the `uid && vaultPass` guard is false
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw");

    const anchor = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchor!.value as HTMLAnchorElement).download).toBe("locked.bin");
    expect(decryptName).not.toHaveBeenCalled();
  });

  it("throws on SHA-256 mismatch without touching saveToDisk (not provided)", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "0".repeat(64)));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });

    await expect(downloadAndDecryptFile("f1", "pw")).rejects.toThrow(/content hash mismatch/);
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("wraps a worker decrypt failure as a wrong-passphrase error", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant"));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });
    processMock.mockRejectedValueOnce(new Error("bad auth tag"));

    await expect(downloadAndDecryptFile("f1", "pw")).rejects.toThrow(/Decryption failed — wrong passphrase\?/);
  });

  it("does not retry a non-transient chunk-fetch error", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant"));
    getFileChunk.mockRejectedValueOnce(new Error("permission denied"));

    await expect(downloadAndDecryptFile("f1", "pw")).rejects.toThrow("permission denied");
    expect(getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("retries a transient chunk-fetch failure and eventually succeeds", async () => {
    vi.useFakeTimers();
    const chunk = chunkBytes(0);
    const hash = expectedHash([chunk]);
    getFileMeta.mockResolvedValueOnce(baseMeta(1, hash));
    getFileChunk
      .mockRejectedValueOnce(new Error("network request failed"))
      .mockResolvedValueOnce({ data: chunk.buffer, sha256: "", compressed: false });

    const promise = downloadAndDecryptFile("f1", "pw");
    await vi.runAllTimersAsync();
    await promise;

    expect(getFileChunk).toHaveBeenCalledTimes(2);
  });

  it("classifies a non-Error rejection from the chunk fetch via String(err)", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant"));
    getFileChunk.mockRejectedValueOnce("some weird non-error failure");

    await expect(downloadAndDecryptFile("f1", "pw")).rejects.toBe("some weird non-error failure");
    expect(getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the chunk fetch itself throws an AbortError", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant"));
    getFileChunk.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));

    await expect(downloadAndDecryptFile("f1", "pw")).rejects.toMatchObject({ name: "AbortError" });
    expect(getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("stops retrying if cancelled during the backoff wait between attempts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant"));
    getFileChunk.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("network request failed");
    });

    const promise = downloadAndDecryptFile("f1", "pw", { signal: controller.signal });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    await assertion;

    expect(getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("uses resolveKey to bypass passphrase-based key resolution for shared-space files", async () => {
    const chunk = chunkBytes(0);
    const hash = expectedHash([chunk]);
    const meta = baseMeta(1, hash);
    getFileMeta.mockResolvedValueOnce(meta);
    getFileChunk.mockResolvedValueOnce({ data: chunk.buffer, sha256: "", compressed: false });
    const resolveKey = vi.fn(async (m: unknown) => {
      expect(m).toEqual(meta);
      return new ArrayBuffer(32);
    });

    await downloadAndDecryptFile("f1", "unused-pass", { resolveKey });

    expect(resolveKey).toHaveBeenCalledTimes(1);
    expect(resolveFileKey).not.toHaveBeenCalled();
  });

  it("reuses a cached resume.keyBytes and skips all key resolution", async () => {
    const chunk = chunkBytes(0);
    const hash = expectedHash([chunk]);
    getFileMeta.mockResolvedValueOnce(baseMeta(1, hash));
    getFileChunk.mockResolvedValueOnce({ data: chunk.buffer, sha256: "", compressed: false });
    const resolveKey = vi.fn();
    const resume = { keyBytes: new ArrayBuffer(32) };

    await downloadAndDecryptFile("f1", "pw", { resume, resolveKey });

    // The cached key short-circuits both derivation paths entirely.
    expect(resolveFileKey).not.toHaveBeenCalled();
    expect(resolveKey).not.toHaveBeenCalled();
    expect(resume.keyBytes).toBeInstanceOf(ArrayBuffer);
  });

  it("uses resolvePassword to derive a per-file passphrase instead of the shared one", async () => {
    const chunk = chunkBytes(0);
    const hash = expectedHash([chunk]);
    getFileMeta.mockResolvedValueOnce(baseMeta(1, hash));
    getFileChunk.mockResolvedValueOnce({ data: chunk.buffer, sha256: "", compressed: false });
    const resolvePassword = vi.fn(async () => "folder-pass");

    await downloadAndDecryptFile("f1", "vault-pass", { resolvePassword });

    expect(resolvePassword).toHaveBeenCalledWith("f1");
    expect(resolveFileKey).toHaveBeenCalledWith("folder-pass", expect.any(Uint8Array), "d3JhcHBlZA==");
  });
});

describe("downloadAndDecryptFile — streaming-to-disk path", () => {
  it("streams chunks to disk via DiskWritable in order instead of building a Blob", async () => {
    const chunks = [chunkBytes(0), chunkBytes(1), chunkBytes(2)];
    const hash = expectedHash(chunks);
    getFileMeta.mockResolvedValueOnce(baseMeta(3, hash));
    getFileChunk.mockImplementation(async (_id: string, index: number) => ({
      data: chunks[index].buffer,
      sha256: "",
      compressed: false,
    }));

    const saveToDisk = fakeDiskWritable();
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadAndDecryptFile("f1", "pw", { saveToDisk });

    expect(saveToDisk.close).toHaveBeenCalledTimes(1);
    expect(saveToDisk.abort).not.toHaveBeenCalled();
    expect(saveToDisk.written.map((w) => w[0])).toEqual([chunks[0][0], chunks[1][0], chunks[2][0]]);

    const anchorCalls = createElementSpy.mock.results.filter((r) => (r.value as HTMLElement).tagName === "A");
    expect(anchorCalls).toHaveLength(0);
  });

  it("aborts the disk writable on integrity failure in the streaming path", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "wrong-hash"));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });
    const saveToDisk = fakeDiskWritable();

    await expect(downloadAndDecryptFile("f1", "pw", { saveToDisk })).rejects.toThrow(/content hash mismatch/);

    expect(saveToDisk.abort).toHaveBeenCalledTimes(1);
    expect(saveToDisk.close).not.toHaveBeenCalled();
  });

  it("does not blow up when saveToDisk has no abort method", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "wrong-hash"));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });
    const saveToDisk: DiskWritable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };

    await expect(downloadAndDecryptFile("f1", "pw", { saveToDisk })).rejects.toThrow(/content hash mismatch/);
  });

  it("swallows an error thrown by an already-closed saveToDisk.abort()", async () => {
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "wrong-hash"));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });
    const saveToDisk: DiskWritable = {
      write: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {
        throw new Error("already closed");
      }),
    };

    await expect(downloadAndDecryptFile("f1", "pw", { saveToDisk })).rejects.toThrow(/content hash mismatch/);
    expect(saveToDisk.abort).toHaveBeenCalledTimes(1);
  });
});

describe("downloadAndDecryptFile — abort/cancel", () => {
  it("rejects immediately when already aborted before starting", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(downloadAndDecryptFile("f1", "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getFileMeta).not.toHaveBeenCalled();
  });

  it("aborts right after the metadata fetch resolves", async () => {
    const controller = new AbortController();
    getFileMeta.mockImplementationOnce(async () => {
      controller.abort();
      return baseMeta(1, "x");
    });

    await expect(downloadAndDecryptFile("f1", "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(resolveFileKey).not.toHaveBeenCalled();
  });

  it("aborts right after key resolution", async () => {
    const controller = new AbortController();
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "x"));
    resolveFileKey.mockImplementationOnce(async () => {
      controller.abort();
      return new ArrayBuffer(32);
    });

    await expect(downloadAndDecryptFile("f1", "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getFileChunk).not.toHaveBeenCalled();
  });

  it("cancels mid-flight and aborts the disk writable", async () => {
    const chunks = [chunkBytes(0), chunkBytes(1), chunkBytes(2)];
    getFileMeta.mockResolvedValueOnce(baseMeta(3, "irrelevant-since-aborted"));
    const controller = new AbortController();
    let calls = 0;
    getFileChunk.mockImplementation(async (_id: string, index: number) => {
      calls++;
      if (calls === 1) controller.abort();
      return { data: chunks[index].buffer, sha256: "", compressed: false };
    });
    const saveToDisk = fakeDiskWritable();

    await expect(
      downloadAndDecryptFile("f1", "pw", { signal: controller.signal, saveToDisk })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(saveToDisk.abort).toHaveBeenCalledTimes(1);
  });

  it("throws DownloadPausedError (not AbortError) when the abort is a pause", async () => {
    const controller = new AbortController();
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant-since-paused"));
    getFileChunk.mockImplementationOnce(async () => {
      controller.abort();
      return { data: chunkBytes(0).buffer, sha256: "", compressed: false };
    });
    const saveToDisk = fakeDiskWritable();

    const err = await downloadAndDecryptFile("f1", "pw", {
      signal: controller.signal,
      saveToDisk,
      pausing: () => true,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("DownloadPausedError");
    expect((err as Error).message).toBe("Download paused");
    // Pause keeps the writable OPEN (not a cancel) so a resume can keep appending.
    expect(saveToDisk.abort).not.toHaveBeenCalled();
    expect(saveToDisk.close).not.toHaveBeenCalled();
  });

  it("catches an abort that lands between chunk processing finishing and the final signal check", async () => {
    const controller = new AbortController();
    getFileMeta.mockResolvedValueOnce(baseMeta(1, "irrelevant-since-aborted"));
    getFileChunk.mockResolvedValueOnce({ data: chunkBytes(0).buffer, sha256: "", compressed: false });
    processMock.mockImplementationOnce(async (input: { encrypted: ArrayBuffer }) => {
      controller.abort();
      return { plaintext: input.encrypted };
    });

    await expect(downloadAndDecryptFile("f1", "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
