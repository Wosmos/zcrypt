import { describe, it, expect } from "vitest";
import { OrderedWriter, type ChunkSink } from "@/lib/ordered-writer";

// A sink that records the ORDER it received chunks (each chunk is tagged with
// its index in byte 0), so we can assert in-order delivery.
function recordingSink() {
  const order: number[] = [];
  const sink: ChunkSink = {
    async write(data) {
      order.push(data[0]);
    },
  };
  return { sink, order };
}
const chunk = (i: number) => new Uint8Array([i]);

describe("OrderedWriter", () => {
  it("delivers jumbled puts to the sink in strict index order", async () => {
    const { sink, order } = recordingSink();
    const w = new OrderedWriter(sink);
    await w.put(2, chunk(2));
    await w.put(0, chunk(0));
    await w.put(1, chunk(1));
    await w.put(4, chunk(4));
    await w.put(3, chunk(3));
    await w.close(5);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(w.written).toBe(5);
  });

  it("handles many concurrent out-of-order puts", async () => {
    const { sink, order } = recordingSink();
    const w = new OrderedWriter(sink);
    const jumbled = [7, 3, 9, 0, 5, 1, 8, 2, 6, 4];
    await Promise.all(jumbled.map((i) => w.put(i, chunk(i))));
    await w.close(10);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("throws on close if a chunk never arrived (never finalizes a truncated file)", async () => {
    const { sink } = recordingSink();
    const w = new OrderedWriter(sink);
    await w.put(0, chunk(0));
    await w.put(2, chunk(2)); // gap at index 1
    await expect(w.close(3)).rejects.toThrow(/incomplete/);
  });

  it("bounds memory but never deadlocks — the cursor chunk is always accepted", async () => {
    const { sink, order } = recordingSink();
    const w = new OrderedWriter(sink, 3); // tiny reorder buffer
    // Buffer future chunks while the cursor (0) is missing, then release it.
    const pending = [w.put(1, chunk(1)), w.put(2, chunk(2)), w.put(3, chunk(3))];
    await w.put(0, chunk(0)); // index === cursor → bypasses backpressure
    await Promise.all(pending);
    await w.close(4);
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
