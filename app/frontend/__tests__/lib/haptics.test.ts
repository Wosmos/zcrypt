import { describe, it, expect, afterEach, vi } from "vitest";
import { haptic } from "@/lib/haptics";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("haptic", () => {
  it("calls navigator.vibrate with the given duration when supported", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    haptic(12);
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("defaults to a short 8ms tick", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("is a no-op when the Vibration API is absent (e.g. iOS Safari)", () => {
    vi.stubGlobal("navigator", {}); // no vibrate
    expect(() => haptic(10)).not.toThrow();
  });

  it("swallows errors thrown by vibrate (rate-limited / background tab)", () => {
    const vibrate = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("navigator", { vibrate });
    expect(() => haptic()).not.toThrow();
  });
});
