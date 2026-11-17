import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";
import { ApiError } from "@/lib/http-error";

const api = vi.hoisted(() => ({
  sendInit: vi.fn(),
  sendChunkUpload: vi.fn(),
  sendComplete: vi.fn(),
  SendInitError: class extends Error {},
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/lib/crypto", () => ({
  CHUNK_SIZE: 4,
  generateSalt: () => new Uint8Array(16),
  deriveKeyBytes: async () => new Uint8Array(32),
  encryptChunk: async (_k: unknown, d: Uint8Array) => d,
  sha256File: async () => "h",
  sha256Hex: async () => "h",
  toBase64: () => "b64",
}));
vi.mock("@/lib/sealed", () => ({ sealText: async (v: string) => v, keyFromBytes: async () => ({}) }));
vi.mock("@/lib/device-profile", () => ({ getDeviceProfile: () => ({ workers: 2 }) }));

import { SendTool } from "@/components/tools/send-tool";

type Call = { idx: number; signal?: AbortSignal; onProgress?: (n: number) => void; resolve: () => void; reject: (e: unknown) => void };
let calls: Call[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  api.sendInit.mockResolvedValue({ session_id: "s", token: "tok" });
  api.sendComplete.mockResolvedValue({ token: "tok" });
  api.sendChunkUpload.mockImplementation(
    (_s: string, idx: number, _c: unknown, _h: string, _z: boolean, opts: { signal?: AbortSignal; onProgress?: (n: number) => void }) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ idx, signal: opts.signal, onProgress: opts.onProgress, resolve, reject });
        opts.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")));
      }),
  );
});
afterEach(cleanup);

async function start(bytes = 10) {
  const { container } = render(<SendTool />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array(bytes)], "a.bin");
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  fireEvent.click(await screen.findByRole("button", { name: /Encrypt|Send|Create/i }));
}

describe("send tool upload", () => {
  it("uploads chunks concurrently and reports per-chunk progress", async () => {
    await start(10);
    await waitFor(() => expect(calls.length).toBe(3));
    calls[0].onProgress?.(2);
    expect(await screen.findByText(/Uploading chunk/)).toBeInTheDocument();
    calls.forEach((c) => c.resolve());
    await waitFor(() => expect(api.sendComplete).toHaveBeenCalledWith("s", expect.anything()));
  });

  it("cancel aborts every in-flight PUT, never completes, and returns to the start", async () => {
    await start(10);
    await waitFor(() => expect(calls.length).toBe(3));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(calls.every((c) => c.signal?.aborted)).toBe(true));
    expect(api.sendComplete).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Encrypt|Send|Create/i })).toBeInTheDocument();
  });

  it("a chunk that fails for good stops the other PUTs and shows the error", async () => {
    await start(10);
    await waitFor(() => expect(calls.length).toBe(3));
    calls[1].reject(new ApiError("forbidden", 403));
    await waitFor(() => expect(calls.every((c) => c.signal?.aborted)).toBe(true));
    expect(await screen.findByText(/forbidden/)).toBeInTheDocument();
    expect(api.sendComplete).not.toHaveBeenCalled();
  });
});
