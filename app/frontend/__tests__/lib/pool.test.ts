import { describe, it, expect } from "vitest";
import { runPool, SHARE_CONCURRENCY } from "@/lib/pool";

describe("runPool", () => {
  it("returns results in input order regardless of completion order", async () => {
    const out = await runPool([30, 5, 15, 1], async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:15", "3:1"]);
  });

  it("never runs more than `limit` workers at once", async () => {
    let active = 0;
    let peak = 0;
    await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      },
      3,
    );
    expect(peak).toBe(3);
  });

  it("defaults to SHARE_CONCURRENCY", async () => {
    expect(SHARE_CONCURRENCY).toBe(6);
    let active = 0;
    let peak = 0;
    await runPool(Array.from({ length: 30 }, (_, i) => i), async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });
    expect(peak).toBe(6);
  });

  it("rejects the whole pool when a worker throws", async () => {
    await expect(
      runPool([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("handles an empty list", async () => {
    expect(await runPool([], async () => 1)).toEqual([]);
  });
});
