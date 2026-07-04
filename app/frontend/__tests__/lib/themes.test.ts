import { describe, it, expect } from "vitest";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isValidColorTheme } from "@/lib/themes";

describe("COLOR_THEMES", () => {
  it("includes a default theme matching DEFAULT_COLOR_THEME", () => {
    expect(DEFAULT_COLOR_THEME).toBe("default");
    expect(COLOR_THEMES.some((t) => t.id === DEFAULT_COLOR_THEME)).toBe(true);
  });

  it("has unique ids", () => {
    const ids = COLOR_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every theme a label, description, and full light/dark swatch", () => {
    for (const theme of COLOR_THEMES) {
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
      for (const mode of [theme.light, theme.dark]) {
        expect(mode.accent.length).toBeGreaterThan(0);
        expect(mode.bg.length).toBeGreaterThan(0);
        expect(mode.surface.length).toBeGreaterThan(0);
        expect(mode.sidebar.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isValidColorTheme", () => {
  it("accepts known theme ids", () => {
    expect(isValidColorTheme("default")).toBe(true);
    expect(isValidColorTheme("cyberpunk")).toBe(true);
  });

  it("rejects an unknown id", () => {
    expect(isValidColorTheme("not-a-theme")).toBe(false);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(isValidColorTheme(null)).toBe(false);
    expect(isValidColorTheme(undefined)).toBe(false);
    expect(isValidColorTheme("")).toBe(false);
  });
});
