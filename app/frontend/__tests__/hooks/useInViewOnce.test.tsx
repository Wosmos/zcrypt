import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useInViewOnce } from "@/hooks/useInViewOnce";

let captured: IntersectionObserverCallback | null;
let lastOptions: IntersectionObserverInit | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

class FakeIntersectionObserver {
  constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
    captured = cb;
    lastOptions = opts;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];
}

function fireIntersect(isIntersecting: boolean) {
  act(() => {
    captured?.(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  });
}

function Probe({ rootMargin }: { rootMargin?: string }) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>(rootMargin);
  return <div ref={ref} data-testid="probe" data-visible={String(isVisible)} />;
}

describe("useInViewOnce", () => {
  beforeEach(() => {
    captured = null;
    lastOptions = undefined;
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not construct an observer when the ref is never attached", () => {
    renderHook(() => useInViewOnce());
    // The hook's own ref stays null (no element assigned), so the effect
    // returns early and never observes.
    expect(observe).not.toHaveBeenCalled();
  });

  it("observes the attached element with the default rootMargin", () => {
    render(<Probe />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(lastOptions).toEqual({ rootMargin: "0px" });
  });

  it("passes a custom rootMargin through to the observer", () => {
    render(<Probe rootMargin="200px" />);
    expect(lastOptions).toEqual({ rootMargin: "200px" });
  });

  it("flips isVisible and disconnects once the element intersects", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe").getAttribute("data-visible")).toBe("false");

    fireIntersect(true);

    expect(getByTestId("probe").getAttribute("data-visible")).toBe("true");
    expect(disconnect).toHaveBeenCalled();
  });

  it("stays hidden and keeps observing while not intersecting", () => {
    const { getByTestId } = render(<Probe />);
    fireIntersect(false);
    expect(getByTestId("probe").getAttribute("data-visible")).toBe("false");
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<Probe />);
    disconnect.mockClear();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
