import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { clearDecryptCacheForFolder } from "@/lib/decrypt-cache";

vi.mock("@/lib/decrypt-cache", () => ({
  clearDecryptCacheForFolder: vi.fn(),
}));

describe("useFolderPasswordStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFolderPasswordStore.getState().clearAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get returns null when nothing is cached for a folder", () => {
    expect(useFolderPasswordStore.getState().get("f1")).toBeNull();
  });

  it("has returns false when nothing is cached", () => {
    expect(useFolderPasswordStore.getState().has("f1")).toBe(false);
  });

  it("set then get returns the cached password", () => {
    useFolderPasswordStore.getState().set("f1", "secret");
    expect(useFolderPasswordStore.getState().get("f1")).toBe("secret");
  });

  it("has returns true for a live cache entry", () => {
    useFolderPasswordStore.getState().set("f1", "secret");
    expect(useFolderPasswordStore.getState().has("f1")).toBe(true);
  });

  it("defaults to a 15-minute TTL", () => {
    useFolderPasswordStore.getState().set("f1", "secret");
    expect(useFolderPasswordStore.getState().getRemainingMinutes("f1")).toBe(15);
  });

  it("honors a custom TTL", () => {
    useFolderPasswordStore.getState().set("f1", "secret", 5);
    expect(useFolderPasswordStore.getState().getRemainingMinutes("f1")).toBe(5);
  });

  it("getRemainingMinutes returns 0 when nothing is cached", () => {
    expect(useFolderPasswordStore.getState().getRemainingMinutes("nope")).toBe(0);
  });

  it("expires lazily via get() once the TTL has passed without the timer firing", () => {
    vi.setSystemTime(0);
    useFolderPasswordStore.getState().set("f1", "secret", 5);

    vi.setSystemTime(5 * 60 * 1000 + 1);
    expect(useFolderPasswordStore.getState().get("f1")).toBeNull();
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("f1");
  });

  it("getRemainingMinutes returns 0 for an already-expired entry", () => {
    vi.setSystemTime(0);
    useFolderPasswordStore.getState().set("f1", "secret", 5);

    vi.setSystemTime(5 * 60 * 1000 + 1);
    expect(useFolderPasswordStore.getState().getRemainingMinutes("f1")).toBe(0);
  });

  it("auto-clears via its own timer once the TTL elapses", () => {
    useFolderPasswordStore.getState().set("f1", "secret", 1);
    expect(useFolderPasswordStore.getState().cache.f1).toBeDefined();

    vi.advanceTimersByTime(60 * 1000);
    expect(useFolderPasswordStore.getState().cache.f1).toBeUndefined();
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("f1");
  });

  it("re-setting a folder's password cancels the pending timer", () => {
    useFolderPasswordStore.getState().set("f1", "a", 5);
    useFolderPasswordStore.getState().set("f1", "b", 10);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(useFolderPasswordStore.getState().get("f1")).toBe("b");

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(useFolderPasswordStore.getState().get("f1")).toBeNull();
  });

  it("keeps per-folder caches independent", () => {
    useFolderPasswordStore.getState().set("f1", "a", 5);
    useFolderPasswordStore.getState().set("f2", "b", 10);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(useFolderPasswordStore.getState().get("f1")).toBeNull();
    expect(useFolderPasswordStore.getState().get("f2")).toBe("b");
  });

  it("clear removes one folder's password, cancels its timer, and evicts its plaintext", () => {
    useFolderPasswordStore.getState().set("f1", "a");
    useFolderPasswordStore.getState().clear("f1");

    expect(useFolderPasswordStore.getState().get("f1")).toBeNull();
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("f1");

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(useFolderPasswordStore.getState().cache).toEqual({});
  });

  it("clear is a state no-op when the folder isn't cached, but still evicts plaintext", () => {
    const before = useFolderPasswordStore.getState().cache;
    useFolderPasswordStore.getState().clear("nope");

    expect(useFolderPasswordStore.getState().cache).toBe(before);
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("nope");
  });

  it("clearAll forgets every cached folder password, its timers, and its plaintext", () => {
    useFolderPasswordStore.getState().set("f1", "a");
    useFolderPasswordStore.getState().set("f2", "b");

    useFolderPasswordStore.getState().clearAll();

    expect(useFolderPasswordStore.getState().cache).toEqual({});
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("f1");
    expect(clearDecryptCacheForFolder).toHaveBeenCalledWith("f2");

    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(useFolderPasswordStore.getState().cache).toEqual({});
  });

  it("clearAll on an empty cache is a no-op", () => {
    expect(() => useFolderPasswordStore.getState().clearAll()).not.toThrow();
    expect(useFolderPasswordStore.getState().cache).toEqual({});
    expect(clearDecryptCacheForFolder).not.toHaveBeenCalled();
  });
});
