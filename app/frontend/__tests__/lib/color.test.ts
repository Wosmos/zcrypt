import { describe, it, expect } from "vitest";
import { hexToOklch, oklchToHex } from "@/lib/color";

describe("oklchToHex", () => {
  it("round-trips an in-gamut color", () => {
    const hex = oklchToHex(hexToOklch("#3b82f6"));
    expect(hex).toBe("#3b82f6");
  });

  it("pulls an out-of-gamut color back into sRGB, keeping its lightness and hue", () => {
    const wild = { l: 0.7, c: 0.4, h: 150 };
    const hex = oklchToHex(wild);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const back = hexToOklch(hex);
    expect(back.c).toBeLessThan(wild.c);
    expect(back.l).toBeCloseTo(wild.l, 1);
    expect(Math.abs(back.h - wild.h)).toBeLessThan(10);
  });
});
