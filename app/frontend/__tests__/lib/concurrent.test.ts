import { describe, it, expect, vi } from "vitest";
import { runWithConcurrency } from "@/lib/concurrent";

describe("runWithConcurrency", () => {
  it("runs every index exactly once", async () => {
    const seen: number[] = [];
    await runWithConcurrency(5, 2, async (i) => {
      seen.push(i);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("resolves immediately with no work when count is 0", async () => {
    const worker = vi.fn();
    await expect(runWithConcurrency(0, 4, worker)).resolves.toBeUndefined();
    expect(worker).not.toHaveBeenCalled();
  });

  it("never exceeds `limit` in-flight workers", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency(8, 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("caps runner count at `count` when limit exceeds it", async () => {
    let peak = 0;
    let inFlight = 0;
    await runWithConcurrency(2, 10, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("aborts before starting the next index, throwing an AbortError", async () => {
    const controller = new AbortController();
    const done: number[] = [];
    const promise = runWithConcurrency(
      10,
      1,
      async (i) => {
        done.push(i);
        if (i === 0) controller.abort();
      },
      controller.signal
    );
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    // Index 0 ran; the abort check fires before shifting the next index.
    expect(done).toEqual([0]);
  });

  it("does not start any work when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = vi.fn();
    await expect(
      runWithConcurrency(4, 2, worker, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(worker).not.toHaveBeenCalled();
  });
});
