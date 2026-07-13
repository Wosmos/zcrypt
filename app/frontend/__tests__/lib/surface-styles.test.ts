import { describe, it, expect, afterEach, vi } from "vitest";
import {
  SURFACE_STYLES,
  DEFAULT_SURFACE_STYLE,
  isValidSurfaceStyle,
  applySurfaceStyle,
} from "@/lib/surface-styles";

afterEach(() => {
  // Unstub first — a test may have stubbed `document` as undefined.
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.surface;
});

describe("SURFACE_STYLES", () => {
  it("includes default + the three design systems, each with id/label/description", () => {
    const ids = SURFACE_STYLES.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["default", "brutalist", "claymorphism", "neumorphism"]));
    for (const s of SURFACE_STYLES) {
      expect(s.label).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });
});

describe("isValidSurfaceStyle", () => {
  it("accepts known ids and rejects everything else", () => {
    expect(isValidSurfaceStyle("brutalist")).toBe(true);
    expect(isValidSurfaceStyle(DEFAULT_SURFACE_STYLE)).toBe(true);
    expect(isValidSurfaceStyle("nope")).toBe(false);
    expect(isValidSurfaceStyle(null)).toBe(false);
    expect(isValidSurfaceStyle(42)).toBe(false);
  });
});

describe("applySurfaceStyle", () => {
  it("sets data-surface for a non-default style", () => {
    applySurfaceStyle("neumorphism");
    expect(document.documentElement.dataset.surface).toBe("neumorphism");
  });

  it("clears data-surface for the default style", () => {
    document.documentElement.dataset.surface = "brutalist";
    applySurfaceStyle(DEFAULT_SURFACE_STYLE);
    expect(document.documentElement.dataset.surface).toBeUndefined();
  });

  it("clears data-surface for an invalid style", () => {
    document.documentElement.dataset.surface = "brutalist";
    applySurfaceStyle("bogus");
    expect(document.documentElement.dataset.surface).toBeUndefined();
  });

  it("is a no-op when document is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(() => applySurfaceStyle("brutalist")).not.toThrow();
  });
});
