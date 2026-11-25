import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import type { FileMetadata } from "@/types";
import { IncorrectPassphraseError } from "@/lib/crypto";

const {
  getFileMetaMock,
  getFileChunkMock,
  getFileLocatorsMock,
  resolveWebDirectMock,
  downloadTelegramChunkMock,
  resolveFileKeyMock,
  decryptChunkMock,
  sha256HexMock,
  deriveDedupKeyBytesMock,
  processMock,
  terminateMock,
  workerPoolCtorMock,
  getDeviceProfileMock,
  viewerKindForMock,
  isWarmOrInflightMock,
  cachedDecryptMock,
  cachedResolveCEKMock,
  resolveFilePasswordGlobalMock,
  authUser,
  tauriMock,
  decryptCacheClear,
} = vi.hoisted(() => ({
  getFileMetaMock: vi.fn(),
  getFileChunkMock: vi.fn(),
  getFileLocatorsMock: vi.fn(),
  resolveWebDirectMock: vi.fn(),
  downloadTelegramChunkMock: vi.fn(),
  resolveFileKeyMock: vi.fn(),
  decryptChunkMock: vi.fn(),
  sha256HexMock: vi.fn(),
  deriveDedupKeyBytesMock: vi.fn(),
  processMock: vi.fn(),
  terminateMock: vi.fn(),
  workerPoolCtorMock: vi.fn(),
  getDeviceProfileMock: vi.fn(),
  viewerKindForMock: vi.fn(),
  isWarmOrInflightMock: vi.fn(),
  cachedDecryptMock: vi.fn(),
  cachedResolveCEKMock: vi.fn(),
  resolveFilePasswordGlobalMock: vi.fn(),
  // Mutable so a test can simulate a signed-out user.
  authUser: { current: { id: "user-1" } as { id: string } | undefined },
  // `isTauri` is a module-level const in lib/tauri, so the desktop branch is
  // only reachable by mocking the module and re-importing with it flipped on.
  // Mutable object (not a literal) so a test can toggle it in place.
  tauriMock: {
    isTauri: false,
    sidecarDecryptToMemory: vi.fn(),
    cancelTransfer: vi.fn(async () => true),
    subscribeProgress: vi.fn(),
  },
  // The module registers its shared-pool teardown on the decrypt cache's
  // clear event; captured so a test can fire a "lock".
  decryptCacheClear: { current: undefined as undefined | (() => void) },
}));

vi.mock("@/lib/api", () => ({
  getFileMeta: getFileMetaMock,
  getFileChunk: getFileChunkMock,
  getFileLocators: getFileLocatorsMock,
}));
vi.mock("@/lib/byos-direct", () => ({ resolveWebDirect: resolveWebDirectMock }));
vi.mock("@/lib/telegram-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-download")>()),
  downloadTelegramChunk: downloadTelegramChunkMock,
}));

vi.mock("@/lib/tauri", () => tauriMock);

vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    resolveFileKey: resolveFileKeyMock,
    decryptChunk: decryptChunkMock,
    sha256Hex: sha256HexMock,
    deriveDedupKeyBytes: deriveDedupKeyBytesMock,
    // createContentHasher stays REAL (noble HMAC-SHA256) so the hmac_v1 tests
    // verify against a genuinely-computed keyed MAC.
  };
});

// The hmac_v1 verify path reads the signed-in user id to derive the MAC key,
// and the desktop decrypt passes it to the core: both branch on whether an id
// actually exists, so this is driven from a mutable holder.
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ user: authUser.current }) },
}));

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
  cachedResolveCEK: cachedResolveCEKMock,
  onDecryptCacheClear: (cb: () => void) => {
    decryptCacheClear.current = cb;
  },
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
  ChunkDecryptError,
  VIEWER_MAX_BYTES,
} from "@/hooks/useFileDecryptor";
import { resetDirectDownloadState } from "@/lib/chunk-source";
import { ApiError } from "@/lib/http-error";
import {
  FolderUnlockCancelled,
  type UseFolderProtection,
} from "@/hooks/useFolderProtection";

/** The real SHA-256 the viewer must compute over these plaintext chunks. */
function sha(parts: string[]): string {
  return createHash("sha256").update(parts.join("")).digest("hex");
}

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
  // Drop the previous test's shared pool so each test starts from a fresh one.
  decryptCacheClear.current?.();
  vi.resetAllMocks();
  // A plain function (not an arrow function) so `new WorkerPool()`, a real
  // `new` invocation: can construct it; arrow functions aren't constructible.
  workerPoolCtorMock.mockImplementation(function WorkerPoolMock() {
    return { process: processMock, terminate: terminateMock };
  });
  getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 4 });
  isWarmOrInflightMock.mockReturnValue(false);
  cachedDecryptMock.mockImplementation(
    (_id: string, _folderId: string | null, decrypt: () => Promise<Blob>) =>
      decrypt()
  );
  cachedResolveCEKMock.mockImplementation(
    (_id: string, _folderId: string | null, resolve: () => Promise<ArrayBuffer>) =>
      resolve()
  );
  resolveFileKeyMock.mockResolvedValue(new ArrayBuffer(32));
  authUser.current = { id: "user-1" };
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
});

describe("runDecryptPipeline", () => {
  it("fans out chunk fetch+decrypt in parallel and reassembles a typed Blob", async () => {
    const file = makeFile({ chunk_count: 3, original_name: "video.mp4" });
    const meta = makeMeta({ chunk_count: 3, sha256: sha(["chunk-0", "chunk-1", "chunk-2"]) });
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
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 2 });

    const onProgress = vi.fn();
    const blob = await runDecryptPipeline(file, "correct-pass", onProgress);

    expect(blob.type).toBe("video/mp4");
    expect(getFileChunkMock).toHaveBeenCalledTimes(3);
    expect(processMock).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);

    const text = await blob.text();
    expect(text).toBe("chunk-0chunk-1chunk-2");
  });

  it("verifies legacy (no wrapped_cek) files against chunk 0 on the main thread and reuses it in the pool fan-out", async () => {
    const file = makeFile({ chunk_count: 2 });
    const meta = makeMeta({ chunk_count: 2, wrapped_cek: undefined, sha256: sha(["chunk-0", "chunk-1"]) });
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

    await runDecryptPipeline(file, "pw");

    expect(decryptChunkMock).toHaveBeenCalledTimes(1);
    // chunk 0 fetched once for the main-thread verify step, then reused by the
    // pool fan-out instead of being fetched again; only chunk 1 is fetched fresh.
    expect(getFileChunkMock).toHaveBeenCalledTimes(2);
    expect(getFileChunkMock.mock.calls.map((c) => c[1]).sort()).toEqual([0, 1]);
  });

  it("types a legacy main-thread key-verification failure (wrong password) before ever reaching the pool", async () => {
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

    await expect(runDecryptPipeline(file, "wrong-pw")).rejects.toBeInstanceOf(IncorrectPassphraseError);
    expect(processMock).not.toHaveBeenCalled();
    expect(workerPoolCtorMock).not.toHaveBeenCalled();
  });

  it("propagates a mid-pipeline chunk fetch failure and stops pulling the remaining chunks", async () => {
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
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 1 });

    await expect(runDecryptPipeline(file, "pw")).rejects.toBe(fetchErr);
    expect(getFileChunkMock.mock.calls.map((c) => c[1])).toEqual([0, 1]);
  });

  it("hands chunk fetches a signal that follows the caller's cancel, and surfaces it as an AbortError", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1 }));
    let seen: AbortSignal | undefined;
    getFileChunkMock.mockImplementation(
      (_id: string, _index: number, sig?: AbortSignal) =>
        new Promise((_, reject) => {
          seen = sig;
          sig?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")));
        }),
    );
    const ctl = new AbortController();

    const pending = runDecryptPipeline(makeFile(), "pw", undefined, ctl.signal);
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(seen!.aborted).toBe(false);
    ctl.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(seen!.aborted).toBe(true);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("throws an AbortError when the caller cancels while the last chunk is still being decrypted", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    const ctl = new AbortController();
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockImplementation(async (input: { chunkIndex: number }) => {
      ctl.abort();
      return { chunkIndex: input.chunkIndex, plaintext: chunkPlaintext(input.chunkIndex) };
    });

    await expect(runDecryptPipeline(makeFile(), "pw", undefined, ctl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("reuses one lazily created worker pool across decrypts and drops it on a lock", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockImplementation(async (input: { chunkIndex: number }) => ({
      chunkIndex: input.chunkIndex,
      plaintext: chunkPlaintext(input.chunkIndex),
    }));

    expect(workerPoolCtorMock).not.toHaveBeenCalled();
    await runDecryptPipeline(makeFile(), "pw");
    await runDecryptPipeline(makeFile({ id: "file-2" }), "pw");
    expect(workerPoolCtorMock).toHaveBeenCalledTimes(1);
    expect(terminateMock).not.toHaveBeenCalled();

    decryptCacheClear.current?.();
    expect(terminateMock).toHaveBeenCalledTimes(1);
    await runDecryptPipeline(makeFile(), "pw");
    expect(workerPoolCtorMock).toHaveBeenCalledTimes(2);
  });

  it("wraps a worker pool decrypt rejection as a ChunkDecryptError, not a wrong-password signal", async () => {
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
      "Decryption failed, wrong passphrase?"
    );
    await expect(runDecryptPipeline(file, "pw")).rejects.toBeInstanceOf(ChunkDecryptError);
    await expect(runDecryptPipeline(file, "pw")).rejects.not.toBeInstanceOf(IncorrectPassphraseError);
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

  it("verifies an hmac_v1 file against its per-user KEYED MAC, not a plain SHA-256 (regression: viewer falsely reported 'corrupted')", async () => {
    // Every recently-uploaded file stores its content hash as a per-user HMAC
    // (sha256_scheme='hmac_v1'). The viewer used to compute a PLAIN sha256Hex and
    // compare (which can never equal the HMAC) so it threw IntegrityError on
    // perfectly good files ("the file may be corrupted"). It must recompute the
    // keyed MAC instead. This test's stored hash IS an HMAC; it only passes if the
    // scheme-aware branch runs.
    const macKey = new Uint8Array(32).fill(7);
    deriveDedupKeyBytesMock.mockResolvedValue(macKey);
    const full = new Uint8Array(chunkPlaintext(0)); // reassembled plaintext = "chunk-0"
    const expectedMac = Array.from(hmac(nobleSha256, macKey, full))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1, sha256_scheme: "hmac_v1", sha256: expectedMac });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    // If the code wrongly took the plain-SHA-256 branch, THIS non-matching value
    // would be compared → IntegrityError. Resolving proves the HMAC branch ran.
    sha256HexMock.mockResolvedValue("plain-sha-would-never-match-an-hmac");

    const blob = await runDecryptPipeline(file, "vault-pass");

    expect(blob).toBeInstanceOf(Blob);
    expect(deriveDedupKeyBytesMock).toHaveBeenCalledWith("vault-pass", "user-1");
    expect(sha256HexMock).not.toHaveBeenCalled(); // hmac_v1 must NOT use the plain hasher
  });

  it("verifies a backed-up file's cek_hmac_v1 MAC, keyed from its own CEK", async () => {
    const { cekMacKey } = await import("@/lib/pk1");
    const full = new Uint8Array(chunkPlaintext(0));
    const mac = Array.from(hmac(nobleSha256, await cekMacKey(new ArrayBuffer(32)), full))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const file = makeFile({ chunk_count: 1 });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256_scheme: "cek_hmac_v1", sha256: mac }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

    await expect(runDecryptPipeline(file, "vault-pass")).resolves.toBeInstanceOf(Blob);
    expect(deriveDedupKeyBytesMock).not.toHaveBeenCalled();

    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256_scheme: "cek_hmac_v1", sha256: "tampered" }));
    await expect(runDecryptPipeline(file, "vault-pass")).rejects.toBeInstanceOf(IntegrityError);
  });

  it("throws IntegrityError when an hmac_v1 file's keyed MAC does not match", async () => {
    deriveDedupKeyBytesMock.mockResolvedValue(new Uint8Array(32).fill(7));
    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1, sha256_scheme: "hmac_v1", sha256: "not-the-real-mac" });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

    await expect(runDecryptPipeline(file, "vault-pass")).rejects.toBeInstanceOf(IntegrityError);
  });

  it("skips the keyed-MAC check entirely when no user is signed in", async () => {
    // The hmac_v1 MAC key is derived from the user id, so with no signed-in user
    // there is nothing to derive from. Verification is skipped rather than
    // failing the file: the alternative is a bogus "corrupted" error on a file
    // that is perfectly fine.
    authUser.current = undefined;
    const file = makeFile({ chunk_count: 1 });
    const meta = makeMeta({ chunk_count: 1, sha256_scheme: "hmac_v1", sha256: "would-never-match" });
    getFileMetaMock.mockResolvedValue(meta);
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

    const blob = await runDecryptPipeline(file, "vault-pass");

    expect(blob).toBeInstanceOf(Blob);
    expect(deriveDedupKeyBytesMock).not.toHaveBeenCalled();
    expect(sha256HexMock).not.toHaveBeenCalled();
  });

  it("handles a zero-chunk file without fanning out any fetchers", async () => {
    const file = makeFile({ chunk_count: 0, original_size: 0 });
    const meta = makeMeta({ chunk_count: 0, sha256: sha([]) });
    getFileMetaMock.mockResolvedValue(meta);

    const blob = await runDecryptPipeline(file, "pw");

    expect(blob.size).toBe(0);
    expect(getFileChunkMock).not.toHaveBeenCalled();
    expect(processMock).not.toHaveBeenCalled();
  });
});

// ── Desktop: decrypt inside the in-process Rust core ────────────────────────
// On Tauri the pipeline hands off to the core (byos-direct bytes, native crypto
// speed, the core's DNS/relay resilience). Only "the core can't serve this"
// falls through to the in-browser pipeline; any other failure surfaces at once
// with the web path's error types.
describe("runDecryptPipeline on desktop", () => {
  /** Re-imports the module with isTauri true so its module-level const is set. */
  async function importDesktop() {
    tauriMock.isTauri = true;
    vi.resetModules();
    return await import("@/hooks/useFileDecryptor");
  }

  afterEach(async () => {
    tauriMock.isTauri = false;
    tauriMock.sidecarDecryptToMemory.mockReset();
    tauriMock.cancelTransfer.mockClear();
    tauriMock.subscribeProgress.mockReset();
    vi.resetModules();
  });

  it("returns the core's bytes as a typed Blob without touching the web pipeline", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    tauriMock.sidecarDecryptToMemory.mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]));

    const blob = await run(makeFile({ original_name: "clip.mp4" }), "pw");

    expect(blob.size).toBe(5);
    expect(blob.type).toBe("video/mp4");
    expect(tauriMock.sidecarDecryptToMemory).toHaveBeenCalledWith(
      "file-1",
      "pw",
      "user-1",
      expect.stringMatching(/^preview-/),
    );
    // The whole browser pipeline is skipped, no meta fetch, no chunk fetch.
    expect(getFileMetaMock).not.toHaveBeenCalled();
    expect(getFileChunkMock).not.toHaveBeenCalled();
  });

  it("forwards only this file's chunk progress and tears the listener down", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    let emit: (p: Record<string, unknown>) => void = () => {};
    const unlisten = vi.fn();
    tauriMock.subscribeProgress.mockImplementation(async (cb: (p: Record<string, unknown>) => void) => {
      emit = cb;
      return unlisten;
    });
    tauriMock.sidecarDecryptToMemory.mockImplementation(async () => {
      // Events arrive while the core is working.
      emit({ file_id: "someone-else", chunks_done: 5, chunks_total: 10 });
      emit({ file_id: "file-1", chunks_done: 0, chunks_total: 0 });
      emit({ file_id: "file-1", chunks_done: 3, chunks_total: 10 });
      return new Uint8Array([9]);
    });

    const onProgress = vi.fn();
    await run(makeFile(), "pw", onProgress);

    // Another file's progress is ignored, and a not-yet-known total (0) would
    // divide to NaN in the UI, both are filtered out.
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(3, 10);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("passes an empty user id to the core when nobody is signed in", async () => {
    authUser.current = undefined;
    const { runDecryptPipeline: run } = await importDesktop();
    tauriMock.sidecarDecryptToMemory.mockResolvedValue(new Uint8Array([1]));

    await run(makeFile(), "pw");

    expect(tauriMock.sidecarDecryptToMemory).toHaveBeenCalledWith(
      "file-1",
      "pw",
      "",
      expect.stringMatching(/^preview-/),
    );
  });

  it("cancels the core's decrypt by its transfer id when the caller aborts", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    let finish: (b: Uint8Array) => void = () => {};
    tauriMock.sidecarDecryptToMemory.mockImplementation(
      () => new Promise<Uint8Array>((resolve) => (finish = resolve)),
    );
    const ctl = new AbortController();

    const p = run(makeFile(), "pw", undefined, ctl.signal);
    await vi.waitFor(() => expect(tauriMock.sidecarDecryptToMemory).toHaveBeenCalled());
    const id = tauriMock.sidecarDecryptToMemory.mock.calls[0][3];
    expect(tauriMock.cancelTransfer).not.toHaveBeenCalled();

    ctl.abort();
    expect(tauriMock.cancelTransfer).toHaveBeenCalledExactlyOnceWith(id);
    finish(new Uint8Array([1]));
    await p.catch(() => {});
  });

  it("ignores a failure to cancel the core and still finishes the decrypt", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    let finish: (b: Uint8Array) => void = () => {};
    tauriMock.sidecarDecryptToMemory.mockImplementation(
      () => new Promise<Uint8Array>((resolve) => (finish = resolve)),
    );
    tauriMock.cancelTransfer.mockRejectedValueOnce(new Error("already finished"));
    const ctl = new AbortController();

    const p = run(makeFile(), "pw", undefined, ctl.signal);
    await vi.waitFor(() => expect(tauriMock.sidecarDecryptToMemory).toHaveBeenCalled());
    ctl.abort();
    await flushMicrotasks();
    finish(new Uint8Array([7]));

    await expect(p).resolves.toBeInstanceOf(Blob);
    expect(tauriMock.cancelTransfer).toHaveBeenCalledTimes(1);
  });

  it("surfaces an abort as an AbortError, not the core's cancelled message", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    const ctl = new AbortController();
    tauriMock.sidecarDecryptToMemory.mockImplementation(async () => {
      ctl.abort();
      throw new Error("cancelled");
    });
    await expect(run(makeFile(), "pw", undefined, ctl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("does not start the core when the signal is already aborted", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    const ctl = new AbortController();
    ctl.abort();
    await expect(run(makeFile(), "pw", undefined, ctl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(tauriMock.sidecarDecryptToMemory).not.toHaveBeenCalled();
  });

  it("does not subscribe at all when the caller wants no progress", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    tauriMock.sidecarDecryptToMemory.mockResolvedValue(new Uint8Array([1]));

    await run(makeFile(), "pw");

    expect(tauriMock.subscribeProgress).not.toHaveBeenCalled();
  });

  it.each([
    "engine not connected. Call start_sync first",
    "file too large for in-memory decrypt: 600000000 bytes (cap 536870912)",
  ])("falls through to the in-browser pipeline when the core cannot serve it (%s)", async (reason) => {
    const { runDecryptPipeline: run } = await importDesktop();
    const unlisten = vi.fn();
    tauriMock.subscribeProgress.mockResolvedValue(unlisten);
    // Tauri rejects with the Rust error as a bare string.
    tauriMock.sidecarDecryptToMemory.mockRejectedValue(reason);

    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockImplementation(async (input: { chunkIndex: number }) => ({
      chunkIndex: input.chunkIndex,
      plaintext: chunkPlaintext(input.chunkIndex),
    }));

    const blob = await run(makeFile(), "pw", vi.fn());

    // The browser path really ran and produced the plaintext.
    expect(getFileMetaMock).toHaveBeenCalledWith("file-1");
    expect(blob.size).toBe(chunkPlaintext(0).byteLength);
    // The subscription is released on the failure path too, not leaked.
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("surfaces a real core failure at once instead of re-running the web pipeline", async () => {
    const { runDecryptPipeline: run } = await importDesktop();
    tauriMock.sidecarDecryptToMemory.mockRejectedValue(new Error("api: http: connection reset"));

    await expect(run(makeFile(), "pw")).rejects.toThrow("connection reset");
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("types the core's errors like the web path: string rejections and integrity", async () => {
    const mod = await importDesktop();
    tauriMock.sidecarDecryptToMemory.mockRejectedValueOnce(
      "crypto: decryption failed: wrong passphrase or corrupt data",
    );
    await expect(mod.runDecryptPipeline(makeFile(), "pw")).rejects.toBeInstanceOf(
      IncorrectPassphraseError,
    );

    tauriMock.sidecarDecryptToMemory.mockRejectedValueOnce("network: connection reset");
    await expect(mod.runDecryptPipeline(makeFile(), "pw")).rejects.toThrow("connection reset");

    tauriMock.sidecarDecryptToMemory.mockRejectedValueOnce(
      "integrity: content hash mismatch: wrong passphrase or corrupt data",
    );
    await expect(mod.runDecryptPipeline(makeFile(), "pw")).rejects.toBeInstanceOf(
      mod.IntegrityError,
    );
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });
});

describe("prefetchFileDecrypt", () => {
  it("does nothing when already warm or in flight", async () => {
    isWarmOrInflightMock.mockReturnValue(true);
    prefetchFileDecrypt(makeFile());
    await flushMicrotasks();
    expect(resolveFilePasswordGlobalMock).not.toHaveBeenCalled();
  });

  it("skips a file above the prefetch size cap (viewer neighbours included)", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    prefetchFileDecrypt(makeFile({ original_size: 51 * 1024 * 1024 }));
    await flushMicrotasks();
    expect(resolveFilePasswordGlobalMock).not.toHaveBeenCalled();
    expect(cachedDecryptMock).not.toHaveBeenCalled();
  });

  it("silently swallows a rejected password resolution", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockRejectedValue(new Error("locked"));
    expect(() => prefetchFileDecrypt(makeFile({ id: "swallow" }))).not.toThrow();
    await flushMicrotasks();
    expect(cachedDecryptMock).not.toHaveBeenCalled();
  });

  it("retries a failed prefetch once after 30s, then stops until the file is opened", async () => {
    vi.useFakeTimers();
    try {
      isWarmOrInflightMock.mockReturnValue(false);
      resolveFilePasswordGlobalMock.mockRejectedValue(new Error("offline"));
      const file = makeFile({ id: "cooldown" });
      prefetchFileDecrypt(file);
      await vi.advanceTimersByTimeAsync(0);
      prefetchFileDecrypt(file);
      await vi.advanceTimersByTimeAsync(29_000);
      prefetchFileDecrypt(file);
      expect(resolveFilePasswordGlobalMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      prefetchFileDecrypt(file);
      await vi.advanceTimersByTimeAsync(0);
      expect(resolveFilePasswordGlobalMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      prefetchFileDecrypt(file);
      await vi.advanceTimersByTimeAsync(0);
      expect(resolveFilePasswordGlobalMock).toHaveBeenCalledTimes(2);

      cachedDecryptMock.mockResolvedValue(new Blob());
      const protection = {
        passwordForFile: vi.fn().mockResolvedValue("pw"),
        isFileProtected: vi.fn().mockReturnValue(false),
      } as unknown as UseFolderProtection;
      const { result } = renderHook(() => useFileDecryptor(protection));
      await result.current.decryptToBlob(file);
      resolveFilePasswordGlobalMock.mockResolvedValue("pw");
      prefetchFileDecrypt(file);
      await vi.advanceTimersByTimeAsync(0);
      expect(resolveFilePasswordGlobalMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a successful prefetch leaves no failure record behind", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockResolvedValue("pw");
    cachedDecryptMock.mockResolvedValue(new Blob());
    const file = makeFile({ id: "ok-prefetch" });
    prefetchFileDecrypt(file);
    await flushMicrotasks();
    prefetchFileDecrypt(file);
    await flushMicrotasks();
    expect(cachedDecryptMock).toHaveBeenCalledTimes(2);
  });

  it("runs the decrypt pipeline through cachedDecrypt when a password is available", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockResolvedValue("pw");
    const file = makeFile({ chunk_count: 1, folder_id: "f1" });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

    prefetchFileDecrypt(file);
    await flushMicrotasks();

    expect(cachedDecryptMock).toHaveBeenCalledWith(
      "file-1",
      "f1",
      expect.any(Function)
    );
    await vi.waitFor(() => expect(getFileMetaMock).toHaveBeenCalledWith("file-1"));
  });

  it("passes null for a file with no folder (vault root)", async () => {
    isWarmOrInflightMock.mockReturnValue(false);
    resolveFilePasswordGlobalMock.mockResolvedValue("pw");
    const file = makeFile({ chunk_count: 1, folder_id: undefined });
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

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
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    const blob = await result.current.decryptToBlob(file);

    expect(blob).toBeInstanceOf(Blob);
    expect(folderProtection.passwordForFile).toHaveBeenCalledWith(file);
  });

  it("starts its own decrypt when it joined a run that another caller's cancel ended", async () => {
    const folderProtection = makeFolderProtection();
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockResolvedValue({ chunkIndex: 0, plaintext: chunkPlaintext(0) });
    cachedDecryptMock.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    const blob = await result.current.decryptToBlob(makeFile(), undefined, new AbortController().signal);

    expect(await blob.text()).toBe("chunk-0");
    expect(cachedDecryptMock).toHaveBeenCalledTimes(2);
  });

  it("does not start another decrypt when its own cancel ended the run", async () => {
    const folderProtection = makeFolderProtection();
    const ctl = new AbortController();
    ctl.abort();
    cachedDecryptMock.mockRejectedValue(new DOMException("Cancelled", "AbortError"));

    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(result.current.decryptToBlob(makeFile(), undefined, ctl.signal)).rejects.toThrow();
    expect(cachedDecryptMock).toHaveBeenCalledTimes(1);
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

  it("does not map a corrupt later chunk to WrongPasswordError", async () => {
    const folderProtection = makeFolderProtection();
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1 }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });
    processMock.mockRejectedValue(new Error("auth tag"));
    const { result } = renderHook(() => useFileDecryptor(folderProtection));
    await expect(result.current.decryptToBlob(makeFile({ chunk_count: 1 }))).rejects.toBeInstanceOf(ChunkDecryptError);
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

describe("runDecryptPipeline chunk transfer", () => {
  const ok = { data: new ArrayBuffer(4), sha256: "x", compressed: false };
  const plain = async (input: { chunkIndex: number }) => ({
    chunkIndex: input.chunkIndex,
    plaintext: chunkPlaintext(input.chunkIndex),
  });

  beforeEach(() => {
    resetDirectDownloadState();
    resolveWebDirectMock.mockResolvedValue(null);
    processMock.mockImplementation(plain);
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 2 });
  });

  it("retries a 503 chunk and then succeeds instead of failing the preview", async () => {
    vi.useFakeTimers();
    try {
      getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
      getFileChunkMock.mockRejectedValueOnce(new ApiError("busy", 503)).mockResolvedValue(ok);
      const p = runDecryptPipeline(makeFile(), "pw");
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await (await p).text()).toBe("chunk-0");
      expect(getFileChunkMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a 403", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1 }));
    getFileChunkMock.mockRejectedValue(new ApiError("forbidden", 403));
    await expect(runDecryptPipeline(makeFile(), "pw")).rejects.toMatchObject({ status: 403 });
    expect(getFileChunkMock).toHaveBeenCalledTimes(1);
  });

  it("previews a file on the user's own Telegram straight from Telegram", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    resolveWebDirectMock.mockResolvedValue({
      platform: "telegram",
      account: "bot",
      telegram: { botToken: "t", chatId: "c" },
    });
    getFileLocatorsMock.mockResolvedValue({
      file_id: "file-1",
      chunks: [
        { index: 0, platform: "telegram", account: "bot", remote_path: "0:F", sha256: "", compressed: false },
      ],
    });
    downloadTelegramChunkMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const blob = await runDecryptPipeline(makeFile(), "pw");

    expect(await blob.text()).toBe("chunk-0");
    expect(downloadTelegramChunkMock).toHaveBeenCalledTimes(1);
    expect(getFileChunkMock).not.toHaveBeenCalled();
  });

  it("falls back to the server relay when Telegram direct fails", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 1, sha256: sha(["chunk-0"]) }));
    resolveWebDirectMock.mockResolvedValue({
      platform: "telegram",
      account: "bot",
      telegram: { botToken: "t", chatId: "c" },
    });
    getFileLocatorsMock.mockResolvedValue({
      file_id: "file-1",
      chunks: [
        { index: 0, platform: "telegram", account: "bot", remote_path: "0:F", sha256: "", compressed: false },
      ],
    });
    downloadTelegramChunkMock.mockRejectedValue(new Error("boom"));
    getFileChunkMock.mockResolvedValue(ok);

    const blob = await runDecryptPipeline(makeFile(), "pw");

    expect(await blob.text()).toBe("chunk-0");
    expect(getFileChunkMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to hold a file over the preview cap in memory, whatever the list said", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ original_size: VIEWER_MAX_BYTES + 1 }));
    await expect(runDecryptPipeline(makeFile({ original_size: 10 }), "pw")).rejects.toThrow(
      /too large to preview/,
    );
    expect(getFileChunkMock).not.toHaveBeenCalled();
  });

  it("a chunk that fails for good stops the other fetches and is the error thrown", async () => {
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 4 }));
    const signals: AbortSignal[] = [];
    getFileChunkMock.mockImplementation((_id: string, i: number, signal: AbortSignal) => {
      signals.push(signal);
      if (i === 0) return Promise.reject(new ApiError("forbidden", 403));
      return new Promise((_r, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
      );
    });
    getDeviceProfileMock.mockReturnValue({ maxConcurrentDownloads: 2 });

    await expect(runDecryptPipeline(makeFile({ chunk_count: 4 }), "pw")).rejects.toMatchObject({
      status: 403,
    });
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(getFileChunkMock).toHaveBeenCalledTimes(2);
  });
});
