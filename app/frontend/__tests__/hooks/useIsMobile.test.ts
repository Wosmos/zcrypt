import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function mockMatchMedia(initialMatches: boolean) {
  const listeners: Array<() => void> = [];
  const mql: FakeMediaQueryList = {
    matches: initialMatches,
    media: "",
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_event: string, cb: () => void) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };
  const matchMediaFn = vi.fn((query: string) => {
    mql.media = query;
    return mql as unknown as MediaQueryList;
  });
  return {
    mql,
    matchMediaFn,
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the media query matches on mount", () => {
    const { matchMediaFn } = mockMatchMedia(true);
    vi.stubGlobal("matchMedia", matchMediaFn);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when the media query does not match on mount", () => {
    const { matchMediaFn } = mockMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMediaFn);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("uses the default max-width query when none is provided", () => {
    const { matchMediaFn } = mockMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMediaFn);

    renderHook(() => useIsMobile());
    expect(matchMediaFn).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("uses a custom query string when provided", () => {
    const { matchMediaFn } = mockMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMediaFn);

    renderHook(() => useIsMobile("(min-width: 1024px)"));
    expect(matchMediaFn).toHaveBeenCalledWith("(min-width: 1024px)");
  });

  it("updates when the media query change event fires", () => {
    const { matchMediaFn, fireChange } = mockMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMediaFn);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => fireChange(true));
    expect(result.current).toBe(true);

    act(() => fireChange(false));
    expect(result.current).toBe(false);
  });

  it("removes the change listener and re-subscribes when the query changes, and on unmount", () => {
    const first = mockMatchMedia(false);
    const second = mockMatchMedia(true);
    const matchMediaFn = vi.fn((query: string) => {
      return (query === "a" ? first.mql : second.mql) as unknown as MediaQueryList;
    });
    vi.stubGlobal("matchMedia", matchMediaFn);

    const { result, rerender, unmount } = renderHook(({ q }) => useIsMobile(q), {
      initialProps: { q: "a" },
    });
    expect(result.current).toBe(false);
    expect(first.mql.addEventListener).toHaveBeenCalledTimes(1);

    rerender({ q: "b" });
    expect(first.mql.removeEventListener).toHaveBeenCalledTimes(1);
    expect(second.mql.addEventListener).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);

    unmount();
    expect(second.mql.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
