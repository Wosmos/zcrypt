import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// This environment's Node runtime ships a global `localStorage` that shadows
// jsdom's and is missing parts of the Storage API (e.g. `.clear`). Stub a
// working in-memory Storage before the module under test reads it. (Same
// workaround as __tests__/hooks/useFolders.test.ts; vitest.setup.ts is shared
// and off-limits.)
vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => {
        backing.set(k, String(v));
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => backing.clear(),
    },
  });
});

import {
  DEFAULT_CUSTOM_THEME,
  loadCustomTheme,
  saveCustomTheme,
  applyCustomThemeVars,
  clearCustomThemeVars,
} from "@/lib/custom-theme";
import { APP_BACKGROUNDS } from "@/lib/app-backgrounds";

const STORAGE_KEY = "zcrypt-custom-theme";

describe("loadCustomTheme / saveCustomTheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when nothing is stored", () => {
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("saves then loads back the same values", () => {
    const values = { accent: "#111111", bg: "#222222", background: APP_BACKGROUNDS[0].key };
    saveCustomTheme(values);
    expect(loadCustomTheme()).toEqual(values);
  });

  it("loads a stored theme without a background as background: undefined", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "#111111", bg: "#222222" }));
    expect(loadCustomTheme()).toEqual({ accent: "#111111", bg: "#222222", background: undefined });
  });

  it("ignores a background field that isn't a string", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accent: "#111111", bg: "#222222", background: 42 })
    );
    expect(loadCustomTheme()).toEqual({ accent: "#111111", bg: "#222222", background: undefined });
  });

  it("falls back to the default when accent/bg are missing or the wrong type", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: 1, bg: "#222222" }));
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("falls back to the default on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("is a no-op / returns default when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
    saveCustomTheme({ accent: "#000", bg: "#fff" });
    vi.unstubAllGlobals();
    // Nothing was written since window was "undefined" during save.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("applyCustomThemeVars / clearCustomThemeVars", () => {
  afterEach(() => {
    clearCustomThemeVars();
    vi.unstubAllGlobals();
  });

  it("derives light text + dark accent-text for a dark background and light accent", () => {
    applyCustomThemeVars({ accent: "#ffffff", bg: "#000000" });
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-bg")).toBe("#000000");
    expect(root.getPropertyValue("--t-primary")).toBe("#ffffff");
    expect(root.getPropertyValue("--t-fg")).toBe("#f0f2f8");
    expect(root.getPropertyValue("--t-primary-fg")).toBe("#161a2b");
  });

  it("derives dark text + white accent-text for a light background and dark accent", () => {
    applyCustomThemeVars({ accent: "#000000", bg: "#ffffff" });
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-fg")).toBe("#161a2b");
    expect(root.getPropertyValue("--t-primary-fg")).toBe("#ffffff");
  });

  it("expands shorthand 3-digit hex colors before computing luminance", () => {
    applyCustomThemeVars({ accent: "#fff", bg: "#000" });
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-fg")).toBe("#f0f2f8");
  });

  it("sets --app-bg to the resolved design css when background is a known key", () => {
    const design = APP_BACKGROUNDS[0];
    applyCustomThemeVars({ accent: "#3b82f6", bg: "#12141f", background: design.key });
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe(design.css);
  });

  it("falls back to the plain canvas fill when background is unset", () => {
    applyCustomThemeVars({ accent: "#3b82f6", bg: "#12141f" });
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("var(--color-bg)");
  });

  it("falls back to the plain canvas fill when background key doesn't resolve to a design", () => {
    applyCustomThemeVars({ accent: "#3b82f6", bg: "#12141f", background: "no-such-key" });
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("var(--color-bg)");
  });

  it("is a no-op when document is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(() => applyCustomThemeVars({ accent: "#000", bg: "#fff" })).not.toThrow();
  });

  it("removes every custom var", () => {
    applyCustomThemeVars({ accent: "#3b82f6", bg: "#12141f", background: APP_BACKGROUNDS[0].key });
    clearCustomThemeVars();
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-bg")).toBe("");
    expect(root.getPropertyValue("--app-bg")).toBe("");
  });

  it("clearCustomThemeVars is a no-op when document is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(() => clearCustomThemeVars()).not.toThrow();
  });
});
