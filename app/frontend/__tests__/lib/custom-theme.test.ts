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
    const values = { accent: "#111111", bgLight: "#dddddd", bgDark: "#222222", background: APP_BACKGROUNDS[0].key };
    saveCustomTheme(values);
    expect(loadCustomTheme()).toEqual(values);
  });

  it("loads a stored theme without a background as background: undefined", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "#111111", bgLight: "#ddd", bgDark: "#222222" }));
    expect(loadCustomTheme()).toEqual({ accent: "#111111", bgLight: "#ddd", bgDark: "#222222", background: undefined });
  });

  it("migrates a legacy single-canvas theme (bg -> dark canvas, default light canvas)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "#111111", bg: "#0a0a0a" }));
    expect(loadCustomTheme()).toEqual({
      accent: "#111111",
      bgLight: DEFAULT_CUSTOM_THEME.bgLight,
      bgDark: "#0a0a0a",
      background: undefined,
    });
  });

  it("ignores a background field that isn't a string", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accent: "#111111", bgLight: "#ddd", bgDark: "#222222", background: 42 })
    );
    expect(loadCustomTheme().background).toBeUndefined();
  });

  it("falls back to the default when the accent is missing or the wrong type", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: 1, bgDark: "#222222" }));
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("falls back to the default when neither a modern nor legacy canvas is present", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "#111111" }));
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("falls back to the default on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("is a no-op / returns default when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
    saveCustomTheme({ accent: "#000", bgLight: "#fff", bgDark: "#111" });
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

  const THEME = { accent: "#ffffff", bgLight: "#eeeeee", bgDark: "#000000" };

  it("uses the DARK canvas and derives light text when isDark=true", () => {
    applyCustomThemeVars(THEME, true);
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-bg")).toBe("#000000");
    expect(root.getPropertyValue("--t-primary")).toBe("#ffffff");
    expect(root.getPropertyValue("--t-fg")).toBe("#f0f2f8");
    expect(root.getPropertyValue("--t-primary-fg")).toBe("#161a2b");
  });

  it("uses the LIGHT canvas and derives dark text when isDark=false", () => {
    applyCustomThemeVars({ accent: "#000000", bgLight: "#ffffff", bgDark: "#111111" }, false);
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--t-bg")).toBe("#ffffff");
    expect(root.getPropertyValue("--t-fg")).toBe("#161a2b");
    expect(root.getPropertyValue("--t-primary-fg")).toBe("#ffffff");
  });

  it("defaults to the dark canvas when isDark is omitted", () => {
    applyCustomThemeVars(THEME);
    expect(document.documentElement.style.getPropertyValue("--t-bg")).toBe("#000000");
  });

  it("expands shorthand 3-digit hex colors before computing luminance", () => {
    applyCustomThemeVars({ accent: "#fff", bgLight: "#eee", bgDark: "#000" }, true);
    expect(document.documentElement.style.getPropertyValue("--t-fg")).toBe("#f0f2f8");
  });

  it("sets --app-bg to the resolved design css when background is a known key", () => {
    const design = APP_BACKGROUNDS[0];
    applyCustomThemeVars({ ...THEME, background: design.key }, true);
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe(design.css);
  });

  it("falls back to the plain canvas fill when background is unset", () => {
    applyCustomThemeVars(THEME, true);
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("var(--color-bg)");
  });

  it("falls back to the plain canvas fill when background key doesn't resolve to a design", () => {
    applyCustomThemeVars({ ...THEME, background: "no-such-key" }, true);
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("var(--color-bg)");
  });

  it("is a no-op when document is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(() => applyCustomThemeVars(THEME, true)).not.toThrow();
  });

  it("removes every custom var", () => {
    applyCustomThemeVars({ ...THEME, background: APP_BACKGROUNDS[0].key }, true);
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
