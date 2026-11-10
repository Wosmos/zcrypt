import { describe, it, expect } from "vitest";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  openThumb,
  padThumb,
  sealThumb,
  THUMB_BUCKET,
  THUMB_MAX_PLAIN,
  unpadThumb,
} from "@/lib/thumb-seal";
import { encryptChunk } from "@/lib/crypto";

const key = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
const otherKey = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

describe("thumb-seal (th1)", () => {
  it("pads to 8 KiB steps with the real length up front, and round-trips", () => {
    const webp = new Uint8Array(5000).fill(9);
    const plain = padThumb(webp)!;
    expect(plain.length).toBe(THUMB_BUCKET);
    expect(new DataView(plain.buffer).getUint32(0)).toBe(5000);
    expect(unpadThumb(plain)).toEqual(webp);
    expect(padThumb(new Uint8Array(THUMB_BUCKET - 4))!.length).toBe(THUMB_BUCKET);
    expect(padThumb(new Uint8Array(THUMB_BUCKET - 3))!.length).toBe(2 * THUMB_BUCKET);
  });

  it("refuses a preview too large to store, and malformed padding", () => {
    expect(padThumb(new Uint8Array(THUMB_MAX_PLAIN))).toBeNull();
    expect(() => unpadThumb(new Uint8Array(3))).toThrow(/too short/);
    const lying = new Uint8Array(16);
    new DataView(lying.buffer).setUint32(0, 100);
    expect(() => unpadThumb(lying)).toThrow(/out of range/);
  });

  it("seals with the file key, so only that key opens it", async () => {
    const webp = new Uint8Array([1, 2, 3, 4, 5]);
    const sealed = (await sealThumb(key, webp))!;
    expect(sealed.length).toBe(THUMB_BUCKET + 28);
    expect(await openThumb(key, sealed)).toEqual(webp);
    await expect(openThumb(otherKey, sealed)).rejects.toThrow();
    expect(await sealThumb(key, new Uint8Array(THUMB_MAX_PLAIN))).toBeNull();
  });

  it("never opens a file chunk sealed with the same key as a preview", async () => {
    const chunk = await encryptChunk(key, padThumb(new Uint8Array([7, 7]))!);
    await expect(openThumb(key, chunk)).rejects.toThrow();
  });

  it("converts between data URLs and bytes", () => {
    const bytes = new Uint8Array([0, 255, 10, 20, 30]);
    const url = bytesToDataUrl(bytes);
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
    expect(dataUrlToBytes(url)).toEqual(bytes);
    expect(bytesToDataUrl(bytes, "image/png").startsWith("data:image/png;base64,")).toBe(true);
  });
});
