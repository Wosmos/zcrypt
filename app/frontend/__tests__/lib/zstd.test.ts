import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the wasm package so the test never instantiates real zstd; the consts are
// created inside vi.hoisted so the (hoisted) vi.mock factory can reference them.
const { ZstdInit, decompress } = vi.hoisted(() => {
  const decompress = vi.fn((d: Uint8Array) => new Uint8Array([...d, 99]));
  const ZstdInit = vi.fn(async () => ({ ZstdStream: { decompress } }));
  return { ZstdInit, decompress };
});

vi.mock("@oneidentity/zstd-js/wasm", () => ({ ZstdInit }));

import { getZstdCodec, zstdDecompress, resetZstdCodec } from "@/lib/zstd";

describe("zstd shared codec", () => {
  beforeEach(() => {
    resetZstdCodec();
    ZstdInit.mockClear();
    decompress.mockClear();
  });

  it("initialises the codec only once across repeated calls", async () => {
    const a = await getZstdCodec();
    const b = await getZstdCodec();
    expect(a).toBe(b);
    expect(ZstdInit).toHaveBeenCalledTimes(1);
  });

  it("decompresses through the shared codec", async () => {
    const out = await zstdDecompress(new Uint8Array([1, 2]));
    expect(Array.from(out)).toEqual([1, 2, 99]);
    expect(decompress).toHaveBeenCalledTimes(1);
  });

  it("resetZstdCodec forces a fresh init on the next use", async () => {
    await getZstdCodec();
    expect(ZstdInit).toHaveBeenCalledTimes(1);
    resetZstdCodec();
    await getZstdCodec();
    expect(ZstdInit).toHaveBeenCalledTimes(2);
  });

  it("returns the payload unchanged when the codec is unavailable", async () => {
    // ZstdInit resolves falsy → zstdDecompress must skip decompression and pass
    // the bytes straight through (matches the old `compressed && codec` guard).
    ZstdInit.mockResolvedValueOnce(null as never);
    const input = new Uint8Array([5, 6, 7]);
    const out = await zstdDecompress(input);
    expect(out).toBe(input);
    expect(decompress).not.toHaveBeenCalled();
  });
});
