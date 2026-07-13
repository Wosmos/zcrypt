import { describe, it, expect } from "vitest";
import { STYLE_COLOR_PRESETS } from "@/lib/style-presets";

describe("STYLE_COLOR_PRESETS", () => {
  it("is a non-empty list of presets with key, label, and a hex color value", () => {
    expect(STYLE_COLOR_PRESETS.length).toBeGreaterThan(0);
    for (const preset of STYLE_COLOR_PRESETS) {
      expect(preset.key).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has unique keys and unique values", () => {
    const keys = STYLE_COLOR_PRESETS.map((p) => p.key);
    const values = STYLE_COLOR_PRESETS.map((p) => p.value);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(values).size).toBe(values.length);
  });
});
