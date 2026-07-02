import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedBlob,
  isWarmOrInflight,
  isForegroundDecryptActive,
  cachedDecrypt,
  clearDecryptCache,
  clearDecryptCacheForFolder,
  clearDecryptCacheForFile,
} from "@/lib/decrypt-cache";

const MB = 1024 * 1024;

// A Blob whose reported `size` we control, so the 300MB LRU budget is testable
// without allocating real megabytes (the cache only reads `.size`).
function sizedBlob(size: number): Blob {
  return { size } as unknown as Blob;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("decrypt-cache", () => {
  beforeEach(() => {
    clearDecryptCache();
  });

  it("runs the decrypt once, then serves the cached blob", async () => {
    const blob = sizedBlob(10);
    const fn = vi.fn(async () => blob);
    const a = await cachedDecrypt("f1", null, fn);
    const b = await cachedDecrypt("f1", null, fn);
    expect(a).toBe(blob);
    expect(b).toBe(blob);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getCachedBlob("f1")).toBe(blob);
  });

  it("getCachedBlob returns undefined for a missing id", () => {
    expect(getCachedBlob("nope")).toBeUndefined();
  });

  it("isWarmOrInflight reflects in-flight then cached state", async () => {
    expect(isWarmOrInflight("f1")).toBe(false);
    const d = deferred<Blob>();
    const p = cachedDecrypt("f1", null, () => d.promise);
    expect(isWarmOrInflight("f1")).toBe(true); // in flight
    d.resolve(sizedBlob(10));
    await p;
    expect(isWarmOrInflight("f1")).toBe(true); // cached
  });

  it("isForegroundDecryptActive is true only while a decrypt is in flight", async () => {
    expect(isForegroundDecryptActive()).toBe(false);
    const d = deferred<Blob>();
    const p = cachedDecrypt("f1", null, () => d.promise);
    expect(isForegroundDecryptActive()).toBe(true); // in flight
    d.resolve(sizedBlob(10));
    await p;
    expect(isForegroundDecryptActive()).toBe(false); // cached ≠ in flight
  });

  it("isForegroundDecryptActive returns false again after a failed decrypt", async () => {
    const d = deferred<Blob>();
    const p = cachedDecrypt("f1", null, () => d.promise);
    expect(isForegroundDecryptActive()).toBe(true);
    d.reject(new Error("boom"));
    await expect(p).rejects.toThrow("boom");
    expect(isForegroundDecryptActive()).toBe(false);
  });

  it("de-duplicates concurrent decrypts of the same id", async () => {
    const d = deferred<Blob>();
    const fn = vi.fn(() => d.promise);
    const p1 = cachedDecrypt("f1", null, fn);
    const p2 = cachedDecrypt("f1", null, fn);
    d.resolve(sizedBlob(10));
    const [a, b] = await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("does not cache a rejected decrypt, so a retry re-runs it", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(sizedBlob(10));
    await expect(cachedDecrypt("f1", null, fn)).rejects.toThrow("boom");
    expect(isWarmOrInflight("f1")).toBe(false);
    await cachedDecrypt("f1", null, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getCachedBlob("f1")).toBeDefined();
  });

  it("clearDecryptCache empties cache and in-flight state", async () => {
    await cachedDecrypt("f1", null, async () => sizedBlob(10));
    clearDecryptCache();
    expect(getCachedBlob("f1")).toBeUndefined();
    expect(isWarmOrInflight("f1")).toBe(false);
  });

  it("a decrypt resolving AFTER a clear does not repopulate the cache", async () => {
    const d = deferred<Blob>();
    const p = cachedDecrypt("f1", null, () => d.promise);
    clearDecryptCache(); // bumps the generation
    d.resolve(sizedBlob(10));
    const blob = await p;
    expect(blob).toBeDefined(); // caller still receives its blob
    expect(getCachedBlob("f1")).toBeUndefined(); // but it is NOT retained
  });

  it("evicts the least-recently-used entry when over the byte budget", async () => {
    await cachedDecrypt("a", null, async () => sizedBlob(120 * MB));
    await cachedDecrypt("b", null, async () => sizedBlob(120 * MB));
    // Touch 'a' so 'b' becomes the least-recently-used entry.
    expect(getCachedBlob("a")).toBeDefined();
    // Adding 'c' takes the total to 360MB (> 300MB) → evict LRU ('b').
    await cachedDecrypt("c", null, async () => sizedBlob(120 * MB));
    expect(getCachedBlob("a")).toBeDefined();
    expect(getCachedBlob("c")).toBeDefined();
    expect(getCachedBlob("b")).toBeUndefined();
  });

  it("never retains a single file larger than the whole budget", async () => {
    const huge = sizedBlob(400 * MB);
    const blob = await cachedDecrypt("big", null, async () => huge);
    expect(blob).toBe(huge); // returned to the caller
    expect(getCachedBlob("big")).toBeUndefined(); // but not cached
  });

  it("clearDecryptCacheForFolder evicts only that folder's entries", async () => {
    await cachedDecrypt("v", null, async () => sizedBlob(10));
    await cachedDecrypt("a1", "folderA", async () => sizedBlob(10));
    await cachedDecrypt("a2", "folderA", async () => sizedBlob(10));
    await cachedDecrypt("b1", "folderB", async () => sizedBlob(10));

    clearDecryptCacheForFolder("folderA");

    expect(getCachedBlob("a1")).toBeUndefined();
    expect(getCachedBlob("a2")).toBeUndefined();
    expect(getCachedBlob("b1")).toBeDefined();
    expect(getCachedBlob("v")).toBeDefined();
  });

  it("clearDecryptCacheForFile evicts only that file and frees its budget", async () => {
    await cachedDecrypt("keep", null, async () => sizedBlob(10));
    await cachedDecrypt("drop", "folderA", async () => sizedBlob(10));

    clearDecryptCacheForFile("drop");

    expect(getCachedBlob("drop")).toBeUndefined();
    expect(getCachedBlob("keep")).toBeDefined();

    // Budget was decremented, so a later large file still fits without evicting
    // 'keep' (regression guard: a missed totalBytes decrement would over-count).
    await cachedDecrypt("big", null, async () => sizedBlob(290 * MB));
    expect(getCachedBlob("keep")).toBeDefined();
    expect(getCachedBlob("big")).toBeDefined();
  });

  it("clearDecryptCacheForFile is a harmless no-op for an unknown id", () => {
    expect(() => clearDecryptCacheForFile("never-seen")).not.toThrow();
  });

  it("an in-flight decrypt for a file cleared mid-flight does not repopulate", async () => {
    const d = deferred<Blob>();
    const p = cachedDecrypt("f1", null, () => d.promise);
    expect(isWarmOrInflight("f1")).toBe(true); // in flight
    clearDecryptCacheForFile("f1"); // bumps generation because it's in flight
    d.resolve(sizedBlob(10));
    const blob = await p;
    expect(blob).toBeDefined(); // caller still receives its blob
    expect(getCachedBlob("f1")).toBeUndefined(); // but it is NOT retained
  });
});
