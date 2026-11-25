import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadChunks } from "@/components/tokens/chunk-download";
import { ApiError } from "@/lib/http-error";

afterEach(() => vi.useRealTimers());

describe("downloadChunks", () => {
  it("waits out a busy server on one chunk instead of failing the download", async () => {
    vi.useFakeTimers();
    const fetchChunk = vi.fn(async (i: number) => new Uint8Array([i]));
    fetchChunk.mockRejectedValueOnce(new ApiError("too many requests", 429));
    const setProgress = vi.fn();
    const result = downloadChunks({
      count: 3,
      concurrency: 2,
      setProgress,
      stageLabel: (d, t) => `${d}/${t}`,
      fetchChunk,
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual([new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([2])]);
    expect(fetchChunk).toHaveBeenCalledTimes(4);
    expect(setProgress).toHaveBeenLastCalledWith({ stage: "3/3", percent: 92 });
  });

  it("fails at once on an error that retrying can't fix", async () => {
    const fetchChunk = vi.fn(async () => {
      throw new Error("This link's key is wrong");
    });
    await expect(
      downloadChunks({ count: 2, concurrency: 1, setProgress: vi.fn(), stageLabel: () => "", fetchChunk }),
    ).rejects.toThrow("key is wrong");
    expect(fetchChunk).toHaveBeenCalledTimes(1);
  });

  it("a chunk that runs out of retries aborts the other workers and its error is the one thrown", async () => {
    const signals: AbortSignal[] = [];
    const fetchChunk = vi.fn(async (i: number, signal: AbortSignal) => {
      signals.push(signal);
      if (i === 0) throw new ApiError("forbidden", 403);
      return new Promise<Uint8Array>((_r, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
      );
    });
    await expect(
      downloadChunks({ count: 4, concurrency: 4, setProgress: vi.fn(), stageLabel: () => "", fetchChunk }),
    ).rejects.toMatchObject({ status: 403 });
    expect(signals).toHaveLength(4);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("a caller cancel aborts in-flight chunks and rejects with an AbortError", async () => {
    const ctl = new AbortController();
    const fetchChunk = vi.fn(
      (_i: number, signal: AbortSignal) =>
        new Promise<Uint8Array>((_r, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
    );
    const p = downloadChunks({
      count: 3,
      concurrency: 3,
      setProgress: vi.fn(),
      stageLabel: () => "",
      fetchChunk,
      signal: ctl.signal,
    });
    await Promise.resolve();
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("streams to the sink in index order without keeping chunks", async () => {
    const out: number[] = [];
    const fetchChunk = async (i: number) => {
      await new Promise((r) => setTimeout(r, (3 - i) * 5));
      return new Uint8Array([i]);
    };
    const result = await downloadChunks({
      count: 3,
      concurrency: 3,
      setProgress: vi.fn(),
      stageLabel: () => "",
      fetchChunk,
      sink: async (d) => void out.push(d[0]),
    });
    expect(out).toEqual([0, 1, 2]);
    expect(result).toEqual([]);
  });
});
