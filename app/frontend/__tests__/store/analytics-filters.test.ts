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

describe("useAnalyticsFiltersStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults preset to '30d' when localStorage has no value", async () => {
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().preset).toBe("30d");
  });

  it("initializes preset from a valid stored value", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("90d");
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().preset).toBe("90d");
  });

  it("falls back to '30d' when the stored value isn't a known preset", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("nope");
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().preset).toBe("30d");
  });

  it("defaults to '30d' when window is undefined (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().preset).toBe("30d");
  });

  it("initializes customStart/customEnd to null when localStorage has no value", async () => {
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().customStart).toBeNull();
    expect(useAnalyticsFiltersStore.getState().customEnd).toBeNull();
  });

  it("initializes customStart/customEnd to null when window is undefined (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().customStart).toBeNull();
    expect(useAnalyticsFiltersStore.getState().customEnd).toBeNull();
  });

  it("initializes customStart/customEnd from localStorage", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((k: string) =>
      k === "zcrypt-analytics-range-start"
        ? "2026-01-01"
        : k === "zcrypt-analytics-range-end"
          ? "2026-01-31"
          : null,
    );
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    expect(useAnalyticsFiltersStore.getState().customStart).toBe("2026-01-01");
    expect(useAnalyticsFiltersStore.getState().customEnd).toBe("2026-01-31");
  });

  it("setPreset updates state and persists to localStorage", async () => {
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    useAnalyticsFiltersStore.getState().setPreset("7d");
    expect(useAnalyticsFiltersStore.getState().preset).toBe("7d");
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-analytics-range", "7d");
  });

  it("setCustomRange sets preset to 'custom' and persists all three values", async () => {
    const { useAnalyticsFiltersStore } = await import("@/store/analytics-filters");
    useAnalyticsFiltersStore.getState().setCustomRange("2026-02-01", "2026-02-15");

    const state = useAnalyticsFiltersStore.getState();
    expect(state.preset).toBe("custom");
    expect(state.customStart).toBe("2026-02-01");
    expect(state.customEnd).toBe("2026-02-15");
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-analytics-range", "custom");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "zcrypt-analytics-range-start",
      "2026-02-01",
    );
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-analytics-range-end", "2026-02-15");
  });
});
