import { describe, it, expect } from "vitest";
import { BACKGROUND_DESIGNS, getBackgroundByKey } from "@/lib/background-presets";

describe("BACKGROUND_DESIGNS", () => {
  it("is a non-empty list of designs with key, label, and a css value", () => {
    expect(BACKGROUND_DESIGNS.length).toBeGreaterThan(0);
    for (const design of BACKGROUND_DESIGNS) {
      expect(design.key).toBeTruthy();
      expect(design.label).toBeTruthy();
      expect(design.css).toBeTruthy();
    }
  });

  it("has unique keys", () => {
    const keys = BACKGROUND_DESIGNS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getBackgroundByKey", () => {
  it("resolves a known key to its css value", () => {
    const design = BACKGROUND_DESIGNS[0];
    expect(getBackgroundByKey(design.key)).toBe(design.css);
  });

  it("returns null for an unknown key", () => {
    expect(getBackgroundByKey("does-not-exist")).toBeNull();
  });
});
