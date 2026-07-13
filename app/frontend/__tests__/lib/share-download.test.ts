import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateCEK, wrapKey, encryptChunk, sha256Hex, toBase64 } from "@/lib/crypto";

const { getShareFileMeta, getShareChunk } = vi.hoisted(() => ({
  getShareFileMeta: vi.fn(),
  getShareChunk: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getShareFileMeta, getShareChunk }));

// share-download.ts checks `signal?.aborted` right after key-unwrap, after
// decrypting each chunk's worth of work, and after the final integrity hash —
// none of which are otherwise mockable since they're real Web Crypto calls.
// Hook into them (still delegating to the real implementation) so a few tests
// can flip the abort signal at those exact points deterministically.
const { unwrapHookRef, decryptHookRef, sha256HookRef } = vi.hoisted(() => ({
  unwrapHookRef: { fn: () => {} },
  decryptHookRef: { fn: () => {} },
  sha256HookRef: { fn: () => {} },
}));
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    unwrapKey: async (...args: Parameters<typeof actual.unwrapKey>) => {
      const result = await actual.unwrapKey(...args);
      unwrapHookRef.fn();
      return result;
    },
    decryptChunk: async (...args: Parameters<typeof actual.decryptChunk>) => {
      const result = await actual.decryptChunk(...args);
      decryptHookRef.fn();
      return result;
    },
    sha256Hex: async (...args: Parameters<typeof actual.sha256Hex>) => {
      const result = await actual.sha256Hex(...args);
      sha256HookRef.fn();
      return result;
    },
  };
});

// share-download.ts calls getZstdCodec() ONCE at module load (`zstdReady`), so
// the resolved codec object is fixed for the whole test file. Route decompress
// through a mutable ref so individual tests can still control its behavior.
const { getZstdCodec, decompressRef } = vi.hoisted(() => {
  const decompressRef = { fn: (d: Uint8Array) => d };
  const getZstdCodec = vi.fn(async () => ({ ZstdStream: { decompress: (d: Uint8Array) => decompressRef.fn(d) } }));
  return { getZstdCodec, decompressRef };
});
vi.mock("@/lib/zstd", () => ({
  getZstdCodec,
  // Mirror the real zstdDecompress: route through the codec (so decompressRef
  // and the null-codec case both drive behavior exactly like production).
  zstdDecompress: async (payload: Uint8Array) => {
    const c = await getZstdCodec();
    if (!c) return payload;
    return c.ZstdStream.decompress(payload);
  },
}));

const { getDeviceProfile } = vi.hoisted(() => ({ getDeviceProfile: vi.fn() }));
vi.mock("@/lib/device-profile", () => ({ getDeviceProfile }));

import { downloadSharedFile } from "@/lib/share-download";

const enc = new TextEncoder();
const dec = new TextDecoder();

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Builds a real share fixture: a random "share key" (as if from the URL
 *  fragment) wraps a random CEK, and the CEK (or a mismatched one, for
 *  failure tests) encrypts each chunk. No passphrase/PBKDF2 involved — shares
 *  skip key derivation entirely. */
async function makeShareFixture(opts: { finalChunks: Uint8Array[]; wrongChunkKey?: boolean; badHash?: boolean }) {
  const shareKey = crypto.getRandomValues(new Uint8Array(32));
  const cek = generateCEK();
  const wrappedCek = await wrapKey(shareKey.buffer.slice(0) as ArrayBuffer, cek);
  const encKey = (opts.wrongChunkKey ? generateCEK() : cek).buffer.slice(0) as ArrayBuffer;

  const encryptedChunks: ArrayBuffer[] = [];
  for (const c of opts.finalChunks) {
    const encChunk = await encryptChunk(encKey, c);
    encryptedChunks.push(encChunk.buffer.slice(encChunk.byteOffset, encChunk.byteOffset + encChunk.byteLength) as ArrayBuffer);
  }

  const fullPlain = concatUint8(opts.finalChunks);
  const sha256 = opts.badHash ? "0".repeat(64) : await sha256Hex(fullPlain);

  return {
    shareKeyB64: toBase64(shareKey),
    meta: {
      id: "share-file-id",
      original_name: "shared.bin",
      original_size: fullPlain.length,
      compressed_size: fullPlain.length,
      encrypted_size: fullPlain.length,
      chunk_count: opts.finalChunks.length,
      sha256,
      salt: "",
      wrapped_cek: toBase64(wrappedCek),
      status: "ready",
      created_at: "2024-01-01T00:00:00Z",
    },
    encryptedChunks,
  };
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 3 });
  decompressRef.fn = (d) => d;
  unwrapHookRef.fn = () => {};
  decryptHookRef.fn = () => {};
  sha256HookRef.fn = () => {};
  createObjectURL = vi.fn(() => "blob:mock-url");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function capturedBlobText(): Promise<string> {
  const blob = createObjectURL.mock.calls[0][0] as Blob;
  return dec.decode(new Uint8Array(await blob.arrayBuffer()));
}

describe("downloadSharedFile — success paths", () => {
  it("downloads, decrypts, verifies, and triggers a Blob download for a multi-chunk share", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("hello "), enc.encode("share")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockImplementation(async (_t: string, idx: number) => ({
      data: f.encryptedChunks[idx],
      sha256: "",
      compressed: false,
    }));

    const stages: string[] = [];
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadSharedFile("tok", f.shareKeyB64, { onProgress: (i) => stages.push(i.stage) });

    expect(stages[0]).toBe("Fetching metadata...");
    expect(stages).toContain("Verifying integrity...");
    expect(stages[stages.length - 1]).toBe("Done");
    expect(await capturedBlobText()).toBe("hello share");

    const anchorCall = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchorCall!.value as HTMLAnchorElement).download).toBe("shared.bin");
  });

  it("falls back to a generic 'download' filename when the share has no original_name", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    f.meta.original_name = ""; // exercises the `meta.original_name || "download"` fallback
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });
    const createElementSpy = vi.spyOn(document, "createElement");

    await downloadSharedFile("tok", f.shareKeyB64);

    const anchorCall = createElementSpy.mock.results.find((r) => (r.value as HTMLElement).tagName === "A");
    expect((anchorCall!.value as HTMLAnchorElement).download).toBe("download");
  });

  it("decompresses a chunk when the server marks it compressed", async () => {
    const desired = enc.encode("decompressed-share-content");
    const f = await makeShareFixture({ finalChunks: [new Uint8Array([7, 7, 7])] });
    f.meta.sha256 = await sha256Hex(desired);
    decompressRef.fn = (d) => {
      expect(Array.from(d)).toEqual([7, 7, 7]);
      return desired;
    };
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: true });

    await downloadSharedFile("tok", f.shareKeyB64);

    expect(await capturedBlobText()).toBe("decompressed-share-content");
  });

  it("forwards the share password to both the meta and chunk endpoints", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("z")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });

    await downloadSharedFile("tok", f.shareKeyB64, { sharePassword: "secret" });

    expect(getShareFileMeta).toHaveBeenCalledWith("tok", "secret");
    expect(getShareChunk).toHaveBeenCalledWith("tok", 0, "secret");
  });
});

describe("downloadSharedFile — failure paths", () => {
  it("throws when the share metadata has no wrapped CEK", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce({ ...f.meta, wrapped_cek: undefined });

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow(
      "This share is missing its encryption key and cannot be decrypted."
    );
    expect(getShareChunk).not.toHaveBeenCalled();
  });

  it("throws a corrupt-link error when the share key can't unwrap the CEK", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    const wrongKeyB64 = toBase64(crypto.getRandomValues(new Uint8Array(32)));

    await expect(downloadSharedFile("tok", wrongKeyB64)).rejects.toThrow(
      "Invalid or corrupt share key — check that you copied the full link."
    );
    expect(getShareChunk).not.toHaveBeenCalled();
  });

  it("surfaces a decryption error when the CEK doesn't match the ciphertext", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")], wrongChunkKey: true });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow(
      "Decryption failed — the share key may be wrong or the link incomplete."
    );
  });

  it("surfaces a decompression error with the offending chunk index", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: true });
    decompressRef.fn = () => {
      throw new Error("ZSTD_ERROR -72");
    };

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow(
      "Decompression failed on chunk 0: ZSTD_ERROR -72"
    );
  });

  it("stringifies a non-Error thrown by decompression", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: true });
    decompressRef.fn = () => {
      throw "raw string decompress failure";
    };

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow(
      "Decompression failed on chunk 0: raw string decompress failure"
    );
  });

  it("surfaces an integrity error on SHA-256 mismatch", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("y")], badHash: true });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow(
      "File integrity check failed — SHA-256 mismatch"
    );
  });

  it("propagates a full failure when the share metadata fetch itself fails", async () => {
    getShareFileMeta.mockRejectedValueOnce(new Error("share not found"));

    await expect(downloadSharedFile("tok", toBase64(new Uint8Array(32)))).rejects.toThrow("share not found");
    expect(getShareChunk).not.toHaveBeenCalled();
  });

  it("propagates a partial failure when one chunk's fetch fails outright", async () => {
    const f = await makeShareFixture({ finalChunks: [enc.encode("aa"), enc.encode("bb")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 1 });
    let calls = 0;
    getShareChunk.mockImplementation(async (_t: string, idx: number) => {
      calls++;
      if (calls === 2) throw new Error("boom");
      return { data: f.encryptedChunks[idx], sha256: "", compressed: false };
    });

    await expect(downloadSharedFile("tok", f.shareKeyB64)).rejects.toThrow("boom");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects immediately when already aborted before starting", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(downloadSharedFile("tok", toBase64(new Uint8Array(32)), { signal: controller.signal })).rejects.toMatchObject(
      { name: "AbortError" }
    );
    expect(getShareFileMeta).not.toHaveBeenCalled();
  });

  it("aborts right after the metadata fetch resolves", async () => {
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockImplementationOnce(async () => {
      controller.abort();
      return f.meta;
    });

    await expect(downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getShareChunk).not.toHaveBeenCalled();
  });

  it("aborts right after the CEK is unwrapped, before any chunk fetch", async () => {
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    unwrapHookRef.fn = () => controller.abort();

    await expect(downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getShareChunk).not.toHaveBeenCalled();
  });

  it("aborts mid-chunk-fetch within the file when cancelled between chunks", async () => {
    getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 1 });
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("aa"), enc.encode("bb")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    let calls = 0;
    getShareChunk.mockImplementation(async (_t: string, idx: number) => {
      calls++;
      if (calls === 1) controller.abort();
      return { data: f.encryptedChunks[idx], sha256: "", compressed: false };
    });

    await expect(
      downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborts between chunks once cancelled right after a chunk finishes decrypting", async () => {
    getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 1 });
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("aa"), enc.encode("bb")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockImplementation(async (_t: string, idx: number) => ({
      data: f.encryptedChunks[idx],
      sha256: "",
      compressed: false,
    }));
    let decryptCalls = 0;
    decryptHookRef.fn = () => {
      decryptCalls++;
      if (decryptCalls === 1) controller.abort();
    };

    await expect(
      downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("catches an abort that lands between the last chunk finishing and the final signal check", async () => {
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });
    decryptHookRef.fn = () => controller.abort();

    await expect(downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("aborts after integrity verification succeeds but before saving the file", async () => {
    const controller = new AbortController();
    const f = await makeShareFixture({ finalChunks: [enc.encode("x")] });
    getShareFileMeta.mockResolvedValueOnce(f.meta);
    getShareChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });
    sha256HookRef.fn = () => controller.abort();

    await expect(downloadSharedFile("tok", f.shareKeyB64, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
