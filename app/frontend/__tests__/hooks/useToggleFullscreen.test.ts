import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useToggleFullscreen } from "@/hooks/useToggleFullscreen";

function setFullscreenElement(value: Element | null) {
  Object.defineProperty(document, "fullscreenElement", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("useToggleFullscreen", () => {
  afterEach(() => {
    setFullscreenElement(null);
    vi.restoreAllMocks();
  });

  it("does nothing when the ref is empty", () => {
    const exit = vi.fn(() => Promise.resolve());
    document.exitFullscreen = exit;
    const { result } = renderHook(() => useToggleFullscreen({ current: null }));

    expect(() => result.current()).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("requests fullscreen on the node when nothing is fullscreen", async () => {
    const node = document.createElement("div");
    const request = vi.fn(() => Promise.resolve());
    node.requestFullscreen = request;
    setFullscreenElement(null);

    const { result } = renderHook(() => useToggleFullscreen({ current: node }));
    result.current();

    expect(request).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it("exits fullscreen when an element is already fullscreen", async () => {
    const node = document.createElement("div");
    const exit = vi.fn(() => Promise.resolve());
    document.exitFullscreen = exit;
    setFullscreenElement(node);

    const { result } = renderHook(() => useToggleFullscreen({ current: node }));
    result.current();

    expect(exit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it("is a no-op (no throw) when requestFullscreen is unavailable", () => {
    const node = document.createElement("div");
    // jsdom does not implement requestFullscreen; leave it undefined.
    (node as { requestFullscreen?: unknown }).requestFullscreen = undefined;
    setFullscreenElement(null);

    const { result } = renderHook(() => useToggleFullscreen({ current: node }));
    expect(() => result.current()).not.toThrow();
  });

  it("swallows rejections from requestFullscreen and exitFullscreen", async () => {
    const node = document.createElement("div");
    node.requestFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    setFullscreenElement(null);
    const { result: enter } = renderHook(() => useToggleFullscreen({ current: node }));
    expect(() => enter.current()).not.toThrow();
    await Promise.resolve();

    document.exitFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    setFullscreenElement(node);
    const { result: leave } = renderHook(() => useToggleFullscreen({ current: node }));
    expect(() => leave.current()).not.toThrow();
    await Promise.resolve();
  });

  it("memoizes the callback per ref identity", () => {
    const ref = { current: document.createElement("div") };
    const { result, rerender } = renderHook(() => useToggleFullscreen(ref));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
