import { afterEach, describe, expect, it, vi } from "vitest";
import { takeInterrupted, watchPageExit } from "@/lib/interrupted-downloads";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("interrupted downloads storage", () => {
  it("reads nothing from junk and removes it", () => {
    sessionStorage.setItem("zc_dl_interrupted", "{not json");
    expect(takeInterrupted()).toEqual([]);
    expect(sessionStorage.getItem("zc_dl_interrupted")).toBeNull();
    sessionStorage.setItem("zc_dl_interrupted", JSON.stringify({ a: 1 }));
    expect(takeInterrupted()).toEqual([]);
    sessionStorage.setItem("zc_dl_interrupted", JSON.stringify(["a", 3, "b"]));
    expect(takeInterrupted()).toEqual(["a", "b"]);
  });

  it("does not fail when storage refuses the note, and stops listening when disposed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const active = vi.fn(() => ["x"]);
    const stop = watchPageExit(active);
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
    expect(active).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event("pagehide"));
    expect(active).toHaveBeenCalledTimes(1);
  });

  it("ignores a pageshow that is not a cache restore", () => {
    sessionStorage.setItem("zc_dl_interrupted", JSON.stringify(["a"]));
    const stop = watchPageExit(() => []);
    window.dispatchEvent(new Event("pageshow"));
    stop();
    expect(takeInterrupted()).toEqual(["a"]);
  });

  it("records nothing when no download is running", () => {
    const stop = watchPageExit(() => []);
    window.dispatchEvent(new Event("pagehide"));
    stop();
    expect(takeInterrupted()).toEqual([]);
  });
});
