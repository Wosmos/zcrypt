import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFrameBatch } from "@/lib/frame-batch";

describe("createFrameBatch", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runFrame = () => frames.shift()?.(0);

  it("flushes the last update per id once per frame", () => {
    const flush = vi.fn();
    const batch = createFrameBatch<number>(flush);
    batch.queue("a", 1);
    batch.queue("a", 2);
    batch.queue("b", 3);
    expect(frames).toHaveLength(1);

    runFrame();
    expect(flush).toHaveBeenCalledTimes(1);
    expect([...flush.mock.calls[0][0]]).toEqual([
      ["a", 2],
      ["b", 3],
    ]);

    batch.queue("a", 4);
    expect(frames).toHaveLength(1);
    runFrame();
    expect([...flush.mock.calls[1][0]]).toEqual([["a", 4]]);
  });

  it("skips the flush when every queued write was dropped", () => {
    const flush = vi.fn();
    const batch = createFrameBatch<number>(flush);
    batch.queue("a", 1);
    batch.drop("a");
    runFrame();
    expect(flush).not.toHaveBeenCalled();
  });
});
