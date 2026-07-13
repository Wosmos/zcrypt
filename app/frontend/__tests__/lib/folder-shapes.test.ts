import { describe, it, expect } from "vitest";
import { FOLDER_SHAPES, getFolderShape, SHAPE_FOR_SURFACE } from "@/lib/folder-shapes";

describe("FOLDER_SHAPES", () => {
  it("offers at least 5 shapes, each with key/label and both SVG paths", () => {
    expect(FOLDER_SHAPES.length).toBeGreaterThanOrEqual(5);
    for (const s of FOLDER_SHAPES) {
      expect(s.key).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.pocket).toMatch(/^M/); // valid-looking SVG path
      expect(s.backPanel).toMatch(/^M/);
    }
  });

  it("has unique keys", () => {
    const keys = FOLDER_SHAPES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getFolderShape", () => {
  it("resolves a known key to its shape", () => {
    const s = FOLDER_SHAPES[1];
    expect(getFolderShape(s.key)).toBe(s);
  });

  it("falls back to the first (Mac) shape for an unknown key", () => {
    expect(getFolderShape("nope")).toBe(FOLDER_SHAPES[0]);
  });

  it("falls back to the first shape for null/undefined", () => {
    expect(getFolderShape(null)).toBe(FOLDER_SHAPES[0]);
    expect(getFolderShape(undefined)).toBe(FOLDER_SHAPES[0]);
  });
});

describe("SHAPE_FOR_SURFACE", () => {
  it("maps every surface style to an existing shape key", () => {
    const valid = new Set(FOLDER_SHAPES.map((s) => s.key));
    for (const shapeKey of Object.values(SHAPE_FOR_SURFACE)) {
      expect(valid.has(shapeKey)).toBe(true);
    }
  });

  it("gives brutalist a square folder and claymorphism a round one", () => {
    expect(SHAPE_FOR_SURFACE.brutalist).toBe("square");
    expect(SHAPE_FOR_SURFACE.claymorphism).toBe("round");
  });
});
