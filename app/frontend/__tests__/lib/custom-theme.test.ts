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
  designedMode,
  paletteFor,
  currentMode,
} from "@/lib/custom-theme";
import { contrastRatio, hexToOklch, oklchToHex } from "@/lib/color";
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

  it("falls back to the default when a stored colour isn't a valid hex", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "red", bg: "#222222" }));
    expect(loadCustomTheme()).toEqual(DEFAULT_CUSTOM_THEME);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "#111111", bg: "#22" }));
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
    applyCustomThemeVars({ accent: "#000000", bg: "#ffffff" }, "light");
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

describe("light and dark versions of a custom theme", () => {
  const dark = { accent: "#3b82f6", bg: "#12141f" };
  const light = { accent: "#93c5fd", bg: "#f7f8fb" };

  it("reads the mode a palette was designed in from its canvas", () => {
    expect(designedMode(dark)).toBe("dark");
    expect(designedMode(light)).toBe("light");
  });

  it("keeps the user's own colors in the mode they designed for", () => {
    expect(paletteFor(dark, "dark")).toEqual(dark);
    expect(paletteFor(light, "light")).toEqual(light);
  });

  it("keeps the user's colors in both modes when adapting is off", () => {
    expect(paletteFor({ ...dark, adapt: false }, "light")).toEqual(dark);
  });

  it("mirrors a dark canvas into a near-white one with the same hue", () => {
    const { bg } = paletteFor(dark, "light");
    expect(hexToOklch(bg).l).toBeGreaterThan(0.93);
    expect(designedMode({ ...dark, bg })).toBe("light");
    expect(Math.abs(hexToOklch(bg).h - hexToOklch(dark.bg).h)).toBeLessThan(25);
  });

  it("mirrors a light canvas into a deep one", () => {
    const { bg } = paletteFor(light, "dark");
    expect(hexToOklch(bg).l).toBeLessThan(0.25);
    expect(designedMode({ ...light, bg })).toBe("dark");
  });

  it("moves the accent until it reaches 3:1 contrast, keeping its hue", () => {
    const { accent, bg } = paletteFor(light, "dark");
    expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(3);
    const pale = paletteFor({ accent: "#fde68a", bg: "#14161f" }, "light");
    expect(contrastRatio(pale.accent, pale.bg)).toBeGreaterThanOrEqual(3);
    expect(Math.abs(hexToOklch(pale.accent).h - hexToOklch("#fde68a").h)).toBeLessThan(20);
  });

  it("applies the version for the requested mode", () => {
    applyCustomThemeVars(dark, "light");
    expect(document.documentElement.style.getPropertyValue("--t-bg")).toBe(
      paletteFor(dark, "light").bg,
    );
    clearCustomThemeVars();
  });
});

describe("color helpers", () => {
  it("round-trips hex through OKLCH", () => {
    for (const hex of ["#3b82f6", "#12141f", "#f7f8fb", "#e11d48"]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("custom theme edge cases", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the adapt-off flag across a save and load", () => {
    saveCustomTheme({ accent: "#111111", bg: "#222222", adapt: false });
    expect(loadCustomTheme()).toEqual({
      accent: "#111111",
      bg: "#222222",
      background: undefined,
      adapt: false,
    });
  });

  it("walks a washed-out accent lighter when mirroring a light palette into dark", () => {
    const light = { accent: "#303030", bg: "#fafafa" };
    expect(designedMode(light)).toBe("light");
    const flipped = paletteFor(light, "dark");
    expect(contrastRatio(flipped.accent, flipped.bg)).toBeGreaterThanOrEqual(3);
    expect(hexToOklch(flipped.accent).l).toBeGreaterThan(hexToOklch(light.accent).l);
  });

  it("falls back to near-white when a black accent cannot be walked lighter", () => {
    const flipped = paletteFor({ accent: "#000000", bg: "#fafafa" }, "dark");
    expect(flipped.accent).toBe("#f5f5f5");
  });

  it("falls back to near-black when the accent is not a usable color", () => {
    const flipped = paletteFor({ accent: "not-a-color", bg: "#101010" }, "light");
    expect(flipped.accent).toBe("#1a1a1a");
  });

  it("reads the resolved mode from the document class", () => {
    document.documentElement.classList.remove("light");
    expect(currentMode()).toBe("dark");
    document.documentElement.classList.add("light");
    expect(currentMode()).toBe("light");
    document.documentElement.classList.remove("light");
  });
});
