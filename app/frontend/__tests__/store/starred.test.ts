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

async function setup(userId: string | null) {
  const { useAuthStore } = await import("@/store/auth");
  useAuthStore.setState({ user: userId ? ({ id: userId } as never) : null });
  return import("@/store/starred");
}

describe("useStarredStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts empty", async () => {
    const { useStarredStore } = await setup("u1");
    expect(useStarredStore.getState().ids).toEqual([]);
  });

  it("toggles a file on and off, newest first, and persists per user", async () => {
    const { useStarredStore } = await setup("u1");
    useStarredStore.getState().toggle("a");
    useStarredStore.getState().toggle("b");
    expect(useStarredStore.getState().ids).toEqual(["b", "a"]);
    expect(localStorage.getItem("zcrypt-starred:u1")).toBe(JSON.stringify(["b", "a"]));
    useStarredStore.getState().toggle("b");
    expect(useStarredStore.getState().ids).toEqual(["a"]);
  });

  it("keeps each signed-in user's stars separate", async () => {
    const { useStarredStore } = await setup("u1");
    useStarredStore.getState().toggle("a");
    useStarredStore.getState().sync("u2");
    expect(useStarredStore.getState().ids).toEqual([]);
    useStarredStore.getState().sync("u1");
    expect(useStarredStore.getState().ids).toEqual(["a"]);
  });

  it("ignores corrupt stored data", async () => {
    localStorage.setItem("zcrypt-starred:u1", "{nope");
    const { useStarredStore } = await setup("u1");
    useStarredStore.getState().sync("u1");
    expect(useStarredStore.getState().ids).toEqual([]);
  });

  it("does nothing without a signed-in user", async () => {
    const { useStarredStore } = await setup(null);
    useStarredStore.getState().toggle("a");
    expect(useStarredStore.getState().ids).toEqual([]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
