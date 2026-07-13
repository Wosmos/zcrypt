import { describe, it, expect } from "vitest";
import { APP_BACKGROUNDS, getAppBackgroundByKey } from "@/lib/app-backgrounds";

describe("APP_BACKGROUNDS", () => {
  it("is a non-empty list with key, label, and a css value", () => {
    expect(APP_BACKGROUNDS.length).toBeGreaterThan(0);
    for (const bg of APP_BACKGROUNDS) {
      expect(bg.key).toBeTruthy();
      expect(bg.label).toBeTruthy();
      expect(bg.css).toBeTruthy();
    }
  });

  it("has unique keys", () => {
    const keys = APP_BACKGROUNDS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every design ends with a var(--color-bg) base layer so the canvas shows through", () => {
    for (const bg of APP_BACKGROUNDS) {
      expect(bg.css.trim().endsWith("var(--color-bg)")).toBe(true);
    }
  });

  it("every design derives its ink from theme vars (adapts to light/dark), never a hardcoded hex", () => {
    for (const bg of APP_BACKGROUNDS) {
      expect(bg.css).toMatch(/var\(--color-(accent|text|bg)\)/);
      expect(bg.css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("getAppBackgroundByKey", () => {
  it("resolves a known key to its css value", () => {
    const bg = APP_BACKGROUNDS[0];
    expect(getAppBackgroundByKey(bg.key)).toBe(bg.css);
  });

  it("returns null for an unknown key", () => {
    expect(getAppBackgroundByKey("does-not-exist")).toBeNull();
  });
});
