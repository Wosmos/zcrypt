import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import type { FileMetadata } from "@/types";
import { IncorrectPassphraseError } from "@/lib/crypto";

const {
  getFileMetaMock,
  getFileChunkMock,
  resolveFileKeyMock,
  decryptChunkMock,
  sha256HexMock,
  processMock,
  terminateMock,
  workerPoolCtorMock,
  getDeviceProfileMock,
  viewerKindForMock,
  isWarmOrInflightMock,
  cachedDecryptMock,
  resolveFilePasswordGlobalMock,
} = vi.hoisted(() => ({
  getFileMetaMock: vi.fn(),
  getFileChunkMock: vi.fn(),
  resolveFileKeyMock: vi.fn(),
  decryptChunkMock: vi.fn(),
  sha256HexMock: vi.fn(),
  processMock: vi.fn(),
  terminateMock: vi.fn(),
  workerPoolCtorMock: vi.fn(),
  getDeviceProfileMock: vi.fn(),
  viewerKindForMock: vi.fn(),
  isWarmOrInflightMock: vi.fn(),
  cachedDecryptMock: vi.fn(),
  resolveFilePasswordGlobalMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getFileMeta: getFileMetaMock,
  getFileChunk: getFileChunkMock,
}));

vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    resolveFileKey: resolveFileKeyMock,
    decryptChunk: decryptChunkMock,
    sha256Hex: sha256HexMock,
  };
});

vi.mock("@/lib/worker-pool", () => ({
  WorkerPool: workerPoolCtorMock,
}));

vi.mock("@/lib/device-profile", () => ({
  getDeviceProfile: getDeviceProfileMock,
}));

vi.mock("@/components/viewers/viewer-kind", () => ({
  viewerKindFor: viewerKindForMock,
}));

vi.mock("@/lib/decrypt-cache", () => ({
  isWarmOrInflight: isWarmOrInflightMock,
  cachedDecrypt: cachedDecryptMock,
}));

vi.mock("@/hooks/useFolderProtection", () => {
  class FolderUnlockCancelled extends Error {
    constructor() {
      super("Folder unlock cancelled");
      this.name = "FolderUnlockCancelled";
    }
  }
  return {
    FolderUnlockCancelled,
    resolveFilePasswordGlobal: resolveFilePasswordGlobalMock,
  };
});

import {
  runDecryptPipeline,
  prefetchFileDecrypt,
  prefetchOnHover,
  useFileDecryptor,
  mimeForFilename,
  IntegrityError,
} from "@/hooks/useFileDecryptor";
import {
  FolderUnlockCancelled,
  type UseFolderProtection,
} from "@/hooks/useFolderProtection";

function makeFile(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    id: "file-1",
    original_name: "photo.jpg",
    original_size: 1000,
    compressed_size: 1000,
    encrypted_size: 1028,
    chunk_count: 1,
    sha256: "abc",
    created_at: new Date().toISOString(),
    folder_id: null,
    ...overrides,
  };
}

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    original_name: "photo.jpg",
    original_size: 1000,
    compressed_size: 1000,
    encrypted_size: 1028,
    chunk_count: 1,
    sha256: "deadbeef",
    salt: btoa("salt-bytes"),
    wrapped_cek: "wrappedcek==",
    status: "ready",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function chunkPlaintext(i: number): ArrayBuffer {
  return new TextEncoder().encode(`chunk-${i}`).buffer as ArrayBuffer;
}

function flushMicrotasks() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.resetAllMocks();
  // A plain function (not an arrow function) so `new WorkerPool()` — a real
  // `new` invocation — can construct it; arrow functions aren't constructible.
  workerPoolCtorMock.mockImplementation(function WorkerPoolMock() {
    return { process: processMock, terminate: terminateMock };
  });
  getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 4 });
  isWarmOrInflightMock.mockReturnValue(false);
  cachedDecryptMock.mockImplementation(
    (_id: string, _folderId: string | null, decrypt: () => Promise<Blob>) =>
      decrypt()
  );
  resolveFileKeyMock.mockResolvedValue(new ArrayBuffer(32));
});

afterEach(() => {
  cleanup();
});

describe("mimeForFilename", () => {
  it("maps known extensions case-insensitively", () => {
    expect(mimeForFilename("Photo.JPG")).toBe("image/jpeg");
    expect(mimeForFilename("clip.MP4")).toBe("video/mp4");
  });

  it("falls back to octet-stream for unknown or missing extensions", () => {
    expect(mimeForFilename("mystery.xyz")).toBe("application/octet-stream");
    expect(mimeForFilename("noextension")).toBe("application/octet-stream");
  });

  it("falls back to octet-stream if split().pop() ever yields undefined (defensive ?? \"\")", () => {
    // A real string's split(".") always returns a non-empty array, so pop()
    // never actually returns undefined — the `?? ""` guards a case that can't
    // happen for any real string. Force it anyway with a fake "string" (typed
    // through as `string` to invoke the function's real logic) whose split()
    // returns an empty array, to prove the fallback itself is correct.
    const fakeFilename = { split: () => [] } as unknown as string;
    expect(mimeForFilename(fakeFilename)).toBe("application/octet-stream");
  });
});

describe("runDecryptPipeline", () => {
  it("fans out chunk fetch+decrypt in parallel and reassembles a typed Blob", async () => {
    const file = makeFile({ chunk_count: 3, original_name: "video.mp4" });
    const meta = makeMeta({ chunk_count: 3, sha256: "matched-hash" });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockImplementation(async () => ({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    }));
    processMock.mockImplementation(
      async (input: { chunkIndex: number }) => ({
        chunkIndex: input.chunkIndex,
        plaintext: chunkPlaintext(input.chunkIndex),
      })
    );
    sha256HexMock.mockResolvedValue("matched-hash");
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 2 });

    const onProgress = vi.fn();
    const blob = await runDecryptPipeline(file, "correct-pass", onProgress);

    expect(blob.type).toBe("video/mp4");
    expect(getFileChunkMock).toHaveBeenCalledTimes(3);
    expect(processMock).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
    expect(terminateMock).toHaveBeenCalledTimes(1);

    const text = await blob.text();
    expect(text).toBe("chunk-0chunk-1chunk-2");
  });

  it("verifies legacy (no wrapped_cek) files against chunk 0 on the main thread and reuses it in the pool fan-out", async () => {
    const file = makeFile({ chunk_count: 2 });
    const meta = makeMeta({ chunk_count: 2, wrapped_cek: undefined, sha256: "h" });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    decryptChunkMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    processMock.mockImplementation(
      async (input: { chunkIndex: number }) => ({
        chunkIndex: input.chunkIndex,
        plaintext: chunkPlaintext(input.chunkIndex),
      })
    );
    sha256HexMock.mockResolvedValue("h");

    await runDecryptPipeline(file, "pw");

    expect(decryptChunkMock).toHaveBeenCalledTimes(1);
    // chunk 0 fetched once for the main-thread verify step, then reused by the
    // pool fan-out instead of being fetched again; only chunk 1 is fetched fresh.
    expect(getFileChunkMock).toHaveBeenCalledTimes(2);
    expect(getFileChunkMock.mock.calls.map((c) => c[1]).sort()).toEqual([0, 1]);
  });

  it("propagates a legacy main-thread key-verification failure (wrong password) before ever reaching the pool", async () => {
    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1, wrapped_cek: undefined });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    const authErr = new DOMException("", "OperationError");
    decryptChunkMock.mockRejectedValue(authErr);

    await expect(runDecryptPipeline(file, "wrong-pw")).rejects.toBe(authErr);
    expect(processMock).not.toHaveBeenCalled();
    expect(workerPoolCtorMock).not.toHaveBeenCalled();
  });

  it("propagates a mid-pipeline chunk fetch failure and still terminates the pool", async () => {
    const file = makeFile({ chunk_count: 3 });
    const meta = makeMeta({ chunk_count: 3 });
    getFileMetaMock.mockResolvedValue(meta);
    const fetchErr = new Error("network down");
    getFileChunkMock.mockImplementation(async (_id: string, index: number) => {
      if (index === 1) throw fetchErr;
      return { data: new ArrayBuffer(4), sha256: "x", compressed: false };
    });
    processMock.mockImplementation(
      async (input: { chunkIndex: number }) => ({
        chunkIndex: input.chunkIndex,
        plaintext: chunkPlaintext(input.chunkIndex),
      })
    );
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 3 });

    await expect(runDecryptPipeline(file, "pw")).rejects.toBe(fetchErr);
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("wraps a worker pool decrypt rejection as a generic wrong-passphrase error", async () => {
    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1 });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockRejectedValue(new Error("worker exploded"));

    await expect(runDecryptPipeline(file, "pw")).rejects.toThrow(
      "Decryption failed — wrong passphrase?"
    );
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("throws IntegrityError when the reassembled SHA-256 does not match", async () => {
    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1, sha256: "expected" });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    sha256HexMock.mockResolvedValue("mismatched");

    await expect(runDecryptPipeline(file, "pw")).rejects.toBeInstanceOf(
      IntegrityError
    );
  });

  it("handles a zero-chunk file without fanning out any fetchers", async () => {
    const file = makeFile({ chunk_count: 0, original_size: 0 });
    const meta = makeMeta({ chunk_count: 0, sha256: "empty-hash" });
    getFileMetaMock.mockResolvedValue(meta);
    sha256HexMock.mockResolvedValue("empty-hash");

    const blob = await runDecryptPipeline(file, "pw");

    expect(blob.size).toBe(0);
    expect(getFileChunkMock).not.toHaveBeenCalled();
    expect(processMock).not.toHaveBeenCalled();
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });
});

describe("prefetchFileDecrypt", () => {
  it("does nothing when already warm or in flight", async () => {
    isWarmOrInflightMock.mockReturnValue(true);
    prefetchFileDecrypt(makeFile());
    await flushMicrotasks();
    expect(resolveFilePasswordGlobalMock).not.toHaveBeenCalled();
  });

  it("silently swallows a rejected password resolution", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockRejectedValue(new Error("locked"));
    expect(() => prefetchFileDecrypt(makeFile())).not.toThrow();
    await flushMicrotasks();
    expect(cachedDecryptMock).not.toHaveBeenCalled();
  });

  it("runs the decrypt pipeline through cachedDecrypt when a password is available", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockResolvedValue("pw");
    const file = makeFile({ chunk_count: 1, folder_id: "f1" });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: "h" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    sha256HexMock.mockResolvedValue("h");

    prefetchFileDecrypt(file);
    await flushMicrotasks();

    expect(cachedDecryptMock).toHaveBeenCalledWith(
      "file-1",
      "f1",
      expect.any(Function)
    );
    expect(getFileMetaMock).toHaveBeenCalledWith("file-1");
  });

  it("passes null for a file with no folder (vault root)", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockResolvedValue("pw");
    const file = makeFile({ chunk_count: 1, folder_id: undefined });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: "h" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    sha256HexMock.mockResolvedValue("h");

    prefetchFileDecrypt(file);
    await flushMicrotasks();

    expect(cachedDecryptMock).toHaveBeenCalledWith(
      "file-1",
      null,
      expect.any(Function)
    );
  });
});

describe("prefetchOnHover", () => {
  beforeEach(() => {
    isWarmOrInflightMock.mockReturnValue(true); // short-circuits prefetchFileDecrypt cheaply
  });

  function stubMatchMedia(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
  }

  it("does nothing when window is undefined (non-browser/SSR context)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => prefetchOnHover(makeFile())).not.toThrow();
    expect(viewerKindForMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does nothing on touch-only devices (no hover support)", () => {
    stubMatchMedia(false);
    prefetchOnHover(makeFile());
    expect(viewerKindForMock).not.toHaveBeenCalled();
  });

  it("skips files with no viewer preview", () => {
    stubMatchMedia(true);
    viewerKindForMock.mockReturnValue("fallback");
    prefetchOnHover(makeFile());
    expect(isWarmOrInflightMock).not.toHaveBeenCalled();
  });

  it("skips files larger than the hover-prefetch cap", () => {
    stubMatchMedia(true);
    viewerKindForMock.mockReturnValue("image");
    prefetchOnHover(makeFile({ original_size: 51 * 1024 * 1024 }));
    expect(isWarmOrInflightMock).not.toHaveBeenCalled();
  });

  it("prefetches previewable files within the size cap", () => {
    stubMatchMedia(true);
    viewerKindForMock.mockReturnValue("image");
    prefetchOnHover(makeFile({ id: "hover-1", original_size: 1024 }));
    expect(isWarmOrInflightMock).toHaveBeenCalledWith("hover-1");
  });
});

describe("useFileDecryptor", () => {
  function makeFolderProtection(
    overrides: Partial<UseFolderProtection> = {}
  ): UseFolderProtection {
    return {
      passwordForFile: vi.fn().mockResolvedValue("pw"),
      isFileProtected: vi.fn().mockReturnValue(false),
      ...overrides,
    } as unknown as UseFolderProtection;
  }

  it("decrypts a file end-to-end through cachedDecrypt", async () => {
    const folderProtection = makeFolderProtection();
    const file = makeFile({ chunk_count: 1 });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: "h" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    sha256HexMock.mockResolvedValue("h");

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    const blob = await result.current.decryptToBlob(file);

    expect(blob).toBeInstanceOf(Blob);
    expect(folderProtection.passwordForFile).toHaveBeenCalledWith(file);
  });

  it("maps a wrong-key failure to WrongPasswordError carrying the folder id when the file is protected", async () => {
    const folderProtection = makeFolderProtection({
      isFileProtected: vi.fn().mockReturnValue(true),
    });
    const file = makeFile({ folder_id: "folder-9" });
    getFileMetaMock.mockResolvedValue(makeMeta());
    resolveFileKeyMock.mockRejectedValue(new IncorrectPassphraseError());

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(file)
    ).rejects.toMatchObject({ name: "WrongPasswordError", folderId: "folder-9" });
  });

  it("maps a wrong-key failure to WrongPasswordError(null) when the file isn't protected", async () => {
    const folderProtection = makeFolderProtection({
      isFileProtected: vi.fn().mockReturnValue(false),
    });
    const file = makeFile({ folder_id: "folder-9" });
    getFileMetaMock.mockResolvedValue(makeMeta());
    resolveFileKeyMock.mockRejectedValue(new IncorrectPassphraseError());

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(file)
    ).rejects.toMatchObject({ name: "WrongPasswordError", folderId: null });
  });

  it("maps a wrong-key failure to WrongPasswordError(null) for a file with no folder (vault root)", async () => {
    const folderProtection = makeFolderProtection({
      isFileProtected: vi.fn().mockReturnValue(true),
    });
    const file = makeFile({ folder_id: undefined });
    getFileMetaMock.mockResolvedValue(makeMeta());
    resolveFileKeyMock.mockRejectedValue(new IncorrectPassphraseError());

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(file)
    ).rejects.toMatchObject({ name: "WrongPasswordError", folderId: null });
  });

  it("re-throws IntegrityError as-is", async () => {
    const folderProtection = makeFolderProtection();
    const file = makeFile({ chunk_count: 1 });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: "expected" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    sha256HexMock.mockResolvedValue("mismatched");

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(file)
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it("re-throws FolderUnlockCancelled as-is (a clean cancel, not an error)", async () => {
    const folderProtection = makeFolderProtection({
      passwordForFile: vi.fn().mockRejectedValue(new FolderUnlockCancelled()),
    });
    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(makeFile())
    ).rejects.toBeInstanceOf(FolderUnlockCancelled);
  });

  it("wraps a non-Error throw into a generic Decryption failed Error", async () => {
    const folderProtection = makeFolderProtection({
      passwordForFile: vi.fn().mockRejectedValue("boom"),
    });
    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(makeFile())
    ).rejects.toThrow("Decryption failed");
  });

  it("re-throws an already-Error failure that isn't a recognised special case", async () => {
    const folderProtection = makeFolderProtection({
      passwordForFile: vi.fn().mockRejectedValue(new Error("network unreachable")),
    });
    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(
      result.current.decryptToBlob(makeFile())
    ).rejects.toThrow("network unreachable");
  });

  it("prefetch delegates to the module-level, deduped prefetchFileDecrypt", () => {
    isWarmOrInflightMock.mockReturnValue(true);
    const folderProtection = makeFolderProtection();
    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    result.current.prefetch(makeFile({ id: "hook-prefetch-1" }));
    expect(isWarmOrInflightMock).toHaveBeenCalledWith("hook-prefetch-1");
  });
});
