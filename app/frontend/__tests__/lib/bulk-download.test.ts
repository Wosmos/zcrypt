import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unzipSync } from "fflate";
import { generateSalt, deriveKeyBytes, generateCEK, wrapKey, encryptChunk, sha256Hex, toBase64 } from "@/lib/crypto";

const { getFileMeta, getFileChunk } = vi.hoisted(() => ({
  getFileMeta: vi.fn(),
  getFileChunk: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getFileMeta, getFileChunk }));

// zstd wasm isn't available in jsdom; delegate decompress to a mutable ref so
// individual tests can swap its behavior without re-importing the module.
const { getZstdCodec, decompressRef } = vi.hoisted(() => {
  const decompressRef = { fn: (d: Uint8Array) => d };
  const getZstdCodec = vi.fn(async () => ({ ZstdStream: { decompress: (d: Uint8Array) => decompressRef.fn(d) } }));
  return { getZstdCodec, decompressRef };
});
vi.mock("@/lib/zstd", () => ({ getZstdCodec }));

const { getDeviceProfile } = vi.hoisted(() => ({ getDeviceProfile: vi.fn() }));
vi.mock("@/lib/device-profile", () => ({ getDeviceProfile }));

import { downloadAsZip, type BulkDownloadFile } from "@/lib/bulk-download";

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

/** Builds a real envelope-encrypted file fixture: a passphrase-derived KEK
 *  wraps a random CEK, and the CEK (or a mismatched one, for failure tests)
 *  encrypts each chunk. This exercises bulk-download's actual crypto calls
 *  instead of mocking them away. */
async function makeFileFixture(opts: {
  passphrase: string;
  finalChunks: Uint8Array[];
  wrongChunkKey?: boolean;
  badHash?: boolean;
}) {
  const salt = generateSalt();
  const kek = await deriveKeyBytes(opts.passphrase, salt);
  const cek = generateCEK();
  const wrappedCek = await wrapKey(kek, cek);
  const encKey = (opts.wrongChunkKey ? generateCEK() : cek).buffer.slice(0) as ArrayBuffer;

  const encryptedChunks: ArrayBuffer[] = [];
  for (const c of opts.finalChunks) {
    const enc = await encryptChunk(encKey, c);
    encryptedChunks.push(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer);
  }

  const fullPlain = concatUint8(opts.finalChunks);
  const sha256 = opts.badHash ? "0".repeat(64) : await sha256Hex(fullPlain);

  return {
    meta: {
      id: "meta-id",
      original_name: "ignored",
      original_size: fullPlain.length,
      compressed_size: fullPlain.length,
      encrypted_size: fullPlain.length,
      chunk_count: opts.finalChunks.length,
      sha256,
      salt: toBase64(salt),
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
  createObjectURL = vi.fn(() => "blob:mock-url");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function capturedZipContents(): Promise<Record<string, string>> {
  const blob = createObjectURL.mock.calls[0][0] as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const unzipped = unzipSync(bytes);
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(unzipped)) out[name] = dec.decode(data);
  return out;
}

describe("downloadAsZip — success paths", () => {
  it("downloads, decrypts, and zips multiple files with correct content and progress stages", async () => {
    const f1 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("hello "), enc.encode("world")] });
    const f2 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("second file")] });

    getFileMeta.mockImplementation(async (id: string) => (id === "id1" ? f1.meta : f2.meta));
    getFileChunk.mockImplementation(async (id: string, index: number) => ({
      data: (id === "id1" ? f1 : f2).encryptedChunks[index],
      sha256: "",
      compressed: false,
    }));

    const files: BulkDownloadFile[] = [
      { fileId: "id1", filename: "a.txt", fileSize: 11 },
      { fileId: "id2", filename: "b.txt", fileSize: 11 },
    ];
    const stages: string[] = [];

    await downloadAsZip(files, "pw", { onProgress: (info) => stages.push(info.stage) });

    expect(stages[0]).toContain("Downloading a.txt");
    expect(stages).toContain("Building ZIP...");
    expect(stages[stages.length - 1]).toBe("Done");

    const contents = await capturedZipContents();
    expect(contents["a.txt"]).toBe("hello world");
    expect(contents["b.txt"]).toBe("second file");
  });

  it("increments the disambiguation suffix past (1) and handles extensionless names", async () => {
    const f1 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("1")] });
    const f2 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("2")] });
    const f3 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("3")] });
    const filesById: Record<string, Awaited<ReturnType<typeof makeFileFixture>>> = { id1: f1, id2: f2, id3: f3 };
    getFileMeta.mockImplementation(async (id: string) => filesById[id].meta);
    getFileChunk.mockImplementation(async (id: string, idx: number) => ({
      data: filesById[id].encryptedChunks[idx],
      sha256: "",
      compressed: false,
    }));

    await downloadAsZip(
      [
        { fileId: "id1", filename: "readme", fileSize: 1 },
        { fileId: "id2", filename: "readme", fileSize: 1 },
        { fileId: "id3", filename: "readme", fileSize: 1 },
      ],
      "pw"
    );

    const contents = await capturedZipContents();
    expect(Object.keys(contents).sort()).toEqual(["readme", "readme (1)", "readme (2)"]);
  });

  it("appends a (n) suffix to duplicate filenames instead of overwriting", async () => {
    const f1 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("A")] });
    const f2 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("B")] });
    getFileMeta.mockImplementation(async (id: string) => (id === "id1" ? f1.meta : f2.meta));
    getFileChunk.mockImplementation(async (id: string, idx: number) => ({
      data: (id === "id1" ? f1 : f2).encryptedChunks[idx],
      sha256: "",
      compressed: false,
    }));

    await downloadAsZip(
      [
        { fileId: "id1", filename: "dup.txt", fileSize: 1 },
        { fileId: "id2", filename: "dup.txt", fileSize: 1 },
      ],
      "pw"
    );

    const contents = await capturedZipContents();
    expect(Object.keys(contents).sort()).toEqual(["dup (1).txt", "dup.txt"]);
  });

  it("decompresses a chunk when the server marks it compressed", async () => {
    const desired = enc.encode("decompressed-content");
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [new Uint8Array([9, 9, 9])] });
    // sha256 in the fixture was computed over the placeholder bytes; override
    // it to match what should come out AFTER decompression.
    f.meta.sha256 = await sha256Hex(desired);
    decompressRef.fn = (d) => {
      expect(Array.from(d)).toEqual([9, 9, 9]);
      return desired;
    };
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: true });

    await downloadAsZip([{ fileId: "id1", filename: "c.txt", fileSize: desired.length }], "pw");

    const contents = await capturedZipContents();
    expect(contents["c.txt"]).toBe("decompressed-content");
  });

  it("skips decompression gracefully if the shared zstd codec is unavailable", async () => {
    getZstdCodec.mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getZstdCodec>>);
    const raw = enc.encode("raw-bytes-no-decompress");
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [raw] });
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: true });

    await downloadAsZip([{ fileId: "id1", filename: "raw.txt", fileSize: raw.length }], "pw");

    const contents = await capturedZipContents();
    expect(contents["raw.txt"]).toBe("raw-bytes-no-decompress");
  });

  it("uses resolvePassword per file instead of the shared (wrong) passphrase", async () => {
    const f = await makeFileFixture({ passphrase: "folder-pw", finalChunks: [enc.encode("secret")] });
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });
    const resolvePassword = vi.fn(async () => "folder-pw");

    await downloadAsZip([{ fileId: "id1", filename: "s.txt", fileSize: 6 }], "wrong-shared-pw", { resolvePassword });

    expect(resolvePassword).toHaveBeenCalledWith("id1");
    const contents = await capturedZipContents();
    expect(contents["s.txt"]).toBe("secret");
  });
});

describe("downloadAsZip — failure paths", () => {
  it("surfaces a per-file decryption error when the CEK doesn't match the ciphertext", async () => {
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("x")], wrongChunkKey: true });
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });

    await expect(downloadAsZip([{ fileId: "id1", filename: "bad.txt", fileSize: 1 }], "pw")).rejects.toThrow(
      "Decryption failed for bad.txt — wrong passphrase?"
    );
  });

  it("surfaces a per-file integrity error on SHA-256 mismatch", async () => {
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("y")], badHash: true });
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockResolvedValueOnce({ data: f.encryptedChunks[0], sha256: "", compressed: false });

    await expect(downloadAsZip([{ fileId: "id1", filename: "bad2.txt", fileSize: 1 }], "pw")).rejects.toThrow(
      "Integrity check failed for bad2.txt"
    );
  });

  it("aborts the whole batch if a later file's metadata fetch fails, never producing a ZIP", async () => {
    const f1 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("ok")] });
    getFileMeta.mockResolvedValueOnce(f1.meta).mockRejectedValueOnce(new Error("404 not found"));
    getFileChunk.mockResolvedValueOnce({ data: f1.encryptedChunks[0], sha256: "", compressed: false });

    const files = [
      { fileId: "id1", filename: "ok.txt", fileSize: 2 },
      { fileId: "id2", filename: "missing.txt", fileSize: 1 },
    ];
    await expect(downloadAsZip(files, "pw")).rejects.toThrow("404 not found");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("propagates an outright chunk-fetch failure for a single-file download", async () => {
    getFileMeta.mockResolvedValueOnce((await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("z")] })).meta);
    getFileChunk.mockRejectedValueOnce(new Error("boom"));

    await expect(downloadAsZip([{ fileId: "id1", filename: "z.txt", fileSize: 1 }], "pw")).rejects.toThrow("boom");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(downloadAsZip([], "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getFileMeta).not.toHaveBeenCalled();
  });

  it("aborts between files when cancelled mid-batch", async () => {
    const controller = new AbortController();
    const f1 = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("ok")] });
    getFileMeta.mockResolvedValueOnce(f1.meta);
    getFileChunk.mockImplementationOnce(async () => {
      controller.abort();
      return { data: f1.encryptedChunks[0], sha256: "", compressed: false };
    });

    const files = [
      { fileId: "id1", filename: "a.txt", fileSize: 2 },
      { fileId: "id2", filename: "b.txt", fileSize: 2 },
    ];
    await expect(downloadAsZip(files, "pw", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getFileMeta).toHaveBeenCalledTimes(1);
  });

  it("aborts mid-chunk-loop within a single file when cancelled between chunks", async () => {
    getDeviceProfile.mockReturnValue({ maxConcurrentDownloads: 1 }); // force sequential single-worker draining
    const controller = new AbortController();
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("aa"), enc.encode("bb")] });
    getFileMeta.mockResolvedValueOnce(f.meta);
    let calls = 0;
    getFileChunk.mockImplementation(async (_id: string, idx: number) => {
      calls++;
      if (calls === 1) controller.abort();
      return { data: f.encryptedChunks[idx], sha256: "", compressed: false };
    });

    await expect(
      downloadAsZip([{ fileId: "id1", filename: "multi.txt", fileSize: 4 }], "pw", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborts after the last file finishes but before the ZIP is built", async () => {
    const controller = new AbortController();
    const f = await makeFileFixture({ passphrase: "pw", finalChunks: [enc.encode("last")] });
    getFileMeta.mockResolvedValueOnce(f.meta);
    getFileChunk.mockImplementationOnce(async () => {
      controller.abort();
      return { data: f.encryptedChunks[0], sha256: "", compressed: false };
    });

    await expect(
      downloadAsZip([{ fileId: "id1", filename: "last.txt", fileSize: 4 }], "pw", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
