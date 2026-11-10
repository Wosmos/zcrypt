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
});
