import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { ApiError } from "@/lib/http-error";

const api = vi.hoisted(() => ({
  getShareInfo: vi.fn(),
  getShareFileMeta: vi.fn(),
  getShareChunk: vi.fn(),
  completeShareDownload: vi.fn(),
  getFolderShareInfo: vi.fn(),
  getFolderShareFileMeta: vi.fn(),
  getFolderShareChunk: vi.fn(),
  completeFolderShareDownload: vi.fn(),
}));

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const { mergeMessages } = await import("@/lib/i18n");
  const { APP_SECTIONS_EN } = await import("@/messages/app-sections");
  const base = (await import("@/messages/en.json")).default as Record<string, unknown>;
  const messages = APP_SECTIONS_EN.reduce((acc, sec) => mergeMessages(acc, sec), base);
  const cache = new Map<string, unknown>();
  return {
    ...actual,
    useTranslations: (ns?: string) => {
      const key = ns ?? "";
      if (!cache.has(key)) {
        cache.set(key, actual.createTranslator({ locale: "en", messages, namespace: ns } as never));
      }
      return cache.get(key);
    },
  };
});
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok" }) }));
vi.mock("@/lib/api", () => api);
vi.mock("@/lib/share-link", () => ({
  keyFromFragment: () => "AAAA",
  pathManifestFromFragment: async () => ({}),
}));
vi.mock("@/lib/crypto", async (orig) => ({
  ...(await orig<typeof import("@/lib/crypto")>()),
  fromBase64: () => new Uint8Array(32),
  unwrapKey: async () => new Uint8Array(32),
  decryptChunk: async (_k: unknown, d: Uint8Array) => d,
}));
vi.mock("@/lib/sealed", async (orig) => ({
  ...(await orig<typeof import("@/lib/sealed")>()),
  keyFromBytes: async () => ({}) as CryptoKey,
}));
vi.mock("@/lib/zstd", () => ({ getZstdCodec: async () => null }));
vi.mock("@/lib/device-profile", () => ({ getDeviceProfile: () => ({ maxConcurrentDownloads: 4 }) }));

import SharePage from "@/app/s/[token]/page";
import FolderSharePage from "@/app/f/[token]/page";

const meta = (chunks: number) => ({
  wrapped_cek: "w",
  chunk_count: chunks,
  sha256: "x",
  sha256_scheme: "hmac_v1",
  download_ticket: "ticket",
  original_name: "a.bin",
});

const hangUntilAbort = (signal?: AbortSignal) =>
  new Promise<never>((_r, reject) =>
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.completeShareDownload.mockResolvedValue(undefined);
  api.completeFolderShareDownload.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe("share page", () => {
  const info = (size: number) => ({
    valid: true,
    has_password: false,
    file_name: "a.bin",
    file_size: size,
  });

  it("cancel aborts the in-flight chunk requests and returns to the start", async () => {
    api.getShareInfo.mockResolvedValue(info(10));
    api.getShareFileMeta.mockResolvedValue(meta(2));
    const signals: AbortSignal[] = [];
    api.getShareChunk.mockImplementation((_t, _i, _p, _tk, signal: AbortSignal) => {
      signals.push(signal);
      return hangUntilAbort(signal);
    });
    render(<SharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download/ }));
    await waitFor(() => expect(signals.length).toBe(2));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(signals.every((s) => s.aborted)).toBe(true));
    expect(await screen.findByRole("button", { name: /Download/ })).toBeInTheDocument();
    expect(api.completeShareDownload).not.toHaveBeenCalled();
  });

  it("refuses a large file in a browser that cannot stream to disk, before fetching anything", async () => {
    api.getShareInfo.mockResolvedValue(info(2 * 1024 ** 3));
    render(<SharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download/ }));
    expect(await screen.findByText(/too large to download in this browser/)).toBeInTheDocument();
    expect(api.getShareFileMeta).not.toHaveBeenCalled();
  });

  it("streams a large file to disk in order and confirms the download", async () => {
    api.getShareInfo.mockResolvedValue(info(2 * 1024 ** 3));
    api.getShareFileMeta.mockResolvedValue(meta(3));
    const written: number[] = [];
    const writable = {
      write: vi.fn(async (d: Uint8Array) => void written.push(d[0])),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
    };
    const picker = vi.fn(async () => ({ createWritable: async () => writable }));
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
    api.getShareChunk.mockImplementation(async (_t, i: number) => {
      if (i === 0) await new Promise((r) => setTimeout(r, 30));
      return { data: new Uint8Array([i]).buffer, sha256: "", compressed: false };
    });
    render(<SharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download/ }));
    await waitFor(() => expect(writable.close).toHaveBeenCalled());
    expect(picker).toHaveBeenCalledWith({ suggestedName: "a.bin" });
    expect(written).toEqual([0, 1, 2]);
    expect(api.completeShareDownload).toHaveBeenCalledWith("tok", "ticket", undefined, expect.anything());
  });

  it("aborts the disk file when a chunk fails for good", async () => {
    api.getShareInfo.mockResolvedValue(info(2 * 1024 ** 3));
    api.getShareFileMeta.mockResolvedValue(meta(2));
    const writable = { write: vi.fn(), close: vi.fn(), abort: vi.fn(async () => {}) };
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = async () => ({
      createWritable: async () => writable,
    });
    api.getShareChunk.mockRejectedValue(new ApiError("gone", 403));
    render(<SharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download/ }));
    await waitFor(() => expect(writable.abort).toHaveBeenCalled());
    expect(writable.close).not.toHaveBeenCalled();
  });
});

describe("folder page", () => {
  const files = (n: number, size = 10) =>
    Array.from({ length: n }, (_, i) => ({ file_id: `f${i}`, name: `n${i}.bin`, size }));
  const folder = (n: number) => ({ valid: true, has_password: false, name: "dir", files: files(n) });

  it("refuses a ZIP over 4 GiB without fetching", async () => {
    api.getFolderShareInfo.mockResolvedValue({ ...folder(5), files: files(5, 900 * 1024 ** 2) });
    render(<FolderSharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download all/i }));
    expect(await screen.findByText(/limited to 4 GB/)).toBeInTheDocument();
    expect(api.getFolderShareFileMeta).not.toHaveBeenCalled();
  });

  it("one chunk failing for good aborts the other in-flight chunks", async () => {
    api.getFolderShareInfo.mockResolvedValue(folder(2));
    api.getFolderShareFileMeta.mockResolvedValue(meta(4));
    const signals: AbortSignal[] = [];
    api.getFolderShareChunk.mockImplementation(
      (_t, _f, i: number, _p, _tk, signal: AbortSignal) => {
        signals.push(signal);
        return i === 1 ? Promise.reject(new ApiError("forbidden", 403)) : hangUntilAbort(signal);
      },
    );
    render(<FolderSharePage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Download" }))[0]);
    await waitFor(() => expect(signals.length).toBe(4));
    await waitFor(() => expect(signals.every((s) => s.aborted)).toBe(true));
    expect(api.completeFolderShareDownload).not.toHaveBeenCalled();
  });

  it("cancel stops a running ZIP and aborts its requests", async () => {
    api.getFolderShareInfo.mockResolvedValue(folder(2));
    api.getFolderShareFileMeta.mockResolvedValue(meta(1));
    const signals: AbortSignal[] = [];
    api.getFolderShareChunk.mockImplementation(
      (_t, _f, _i, _p, _tk, signal: AbortSignal) => {
        signals.push(signal);
        return hangUntilAbort(signal);
      },
    );
    render(<FolderSharePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Download all/i }));
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(signals.every((s) => s.aborted)).toBe(true));
    expect(await screen.findByRole("button", { name: /Download all/i })).toBeEnabled();
  });
});
