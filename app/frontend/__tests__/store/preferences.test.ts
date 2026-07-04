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

describe("usePreferencesStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults advancedMode to false when localStorage has no flag", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("initializes advancedMode to true when the localStorage flag is 'true'", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("true");
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(true);
  });

  it("initializes advancedMode to false when the localStorage flag is some other value", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("nope");
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("defaults to false when window is undefined (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("setAdvancedMode(true) updates state and persists to localStorage", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    usePreferencesStore.getState().setAdvancedMode(true);
    expect(usePreferencesStore.getState().advancedMode).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-advanced-mode", "true");
  });

  it("setAdvancedMode(false) updates state and persists to localStorage", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    usePreferencesStore.getState().setAdvancedMode(true);
    usePreferencesStore.getState().setAdvancedMode(false);
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-advanced-mode", "false");
  });
});
