import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => store.delete(k)),
    clear: vi.fn(() => store.clear()),
  };
}

describe("useRecentlyViewedStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts empty when localStorage has nothing stored", async () => {
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([]);
  });

  it("defaults to empty when window is undefined (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([]);
  });

  it("loads valid entries already in localStorage", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify([{ fileId: "a", viewedAt: 1 }]),
    );
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([{ fileId: "a", viewedAt: 1 }]);
  });

  it("discards a non-array payload", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({ oops: 1 }));
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([]);
  });

  it("filters out malformed entries", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify([{ fileId: "a", viewedAt: 1 }, { fileId: 2, viewedAt: "nope" }, null, "x"]),
    );
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([{ fileId: "a", viewedAt: 1 }]);
  });

  it("recovers from corrupted JSON", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("{not json");
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    expect(useRecentlyViewedStore.getState().entries).toEqual([]);
  });

  it("logView() prepends a new entry and persists it", async () => {
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    useRecentlyViewedStore.getState().logView("f1");
    const entries = useRecentlyViewedStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].fileId).toBe("f1");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "zcrypt-recently-viewed",
      JSON.stringify(entries),
    );
  });

  it("logView() moves an already-viewed file back to the front instead of duplicating it", async () => {
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    useRecentlyViewedStore.getState().logView("f1");
    useRecentlyViewedStore.getState().logView("f2");
    useRecentlyViewedStore.getState().logView("f1");
    const entries = useRecentlyViewedStore.getState().entries;
    expect(entries.map((e) => e.fileId)).toEqual(["f1", "f2"]);
  });

  it("logView() caps the list at 20 entries", async () => {
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    for (let i = 0; i < 25; i++) {
      useRecentlyViewedStore.getState().logView(`f${i}`);
    }
    const entries = useRecentlyViewedStore.getState().entries;
    expect(entries).toHaveLength(20);
    expect(entries[0].fileId).toBe("f24");
  });

  it("logView() keeps the in-memory update even when persistence throws", async () => {
    const { useRecentlyViewedStore } = await import("@/store/recently-viewed");
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    useRecentlyViewedStore.getState().logView("f1");
    expect(useRecentlyViewedStore.getState().entries[0].fileId).toBe("f1");
  });
});
