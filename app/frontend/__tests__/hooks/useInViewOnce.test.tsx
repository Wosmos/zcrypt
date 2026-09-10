import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useInViewOnce } from "@/hooks/useInViewOnce";

// The reveal is an enhancement, never a prerequisite for reading the page:
// the hook must default to VISIBLE and only hide an element when it is certain
// it can bring it back. These tests pin every escape hatch, because a missed
// one leaves a section permanently blank for real visitors.

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

/** Fire one observer tick. `top` is the element's position vs. the viewport. */
function fireTick(isIntersecting: boolean, top = 400) {
  act(() => {
    captured?.(
      [{ isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

/** Renders below the fold by default, so the hook takes its "hide" path. */
function Probe({ rootMargin, top = 5000 }: { rootMargin?: string; top?: number }) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>(rootMargin);
  return (
    <div
      ref={(el) => {
        if (el) el.getBoundingClientRect = () => ({ top }) as DOMRect;
        ref.current = el;
      }}
      data-testid="probe"
      data-visible={String(isVisible)}
    />
  );
}

const visible = (el: HTMLElement) => el.getAttribute("data-visible") === "true";

describe("useInViewOnce", () => {
  beforeEach(() => {
    captured = null;
    lastOptions = undefined;
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
    );
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not construct an observer when the ref is never attached", () => {
    const { result } = renderHook(() => useInViewOnce());
    expect(observe).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(true); // server-rendered output is readable
  });

  it("observes a below-the-fold element with the default rootMargin", () => {
    render(<Probe />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(lastOptions).toEqual({ rootMargin: "0px" });
  });

  it("passes a custom rootMargin through to the observer", () => {
    render(<Probe rootMargin="200px" />);
    expect(lastOptions).toEqual({ rootMargin: "200px" });
  });

  it("leaves an element that is already on screen visible, and never observes it", () => {
    const { getByTestId } = render(<Probe top={200} />);
    expect(visible(getByTestId("probe"))).toBe(true);
    expect(observe).not.toHaveBeenCalled(); // no pointless fade-in
  });

  it("stays visible, unobserved, when the visitor asked for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    const { getByTestId } = render(<Probe />);
    expect(visible(getByTestId("probe"))).toBe(true);
    expect(observe).not.toHaveBeenCalled();
  });

  it("stays visible when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { getByTestId } = render(<Probe />);
    expect(visible(getByTestId("probe"))).toBe(true);
  });

  it("flips isVisible and disconnects once the element intersects", () => {
    const { getByTestId } = render(<Probe />);
    expect(visible(getByTestId("probe"))).toBe(false);
    fireTick(true);
    expect(visible(getByTestId("probe"))).toBe(true);
    expect(disconnect).toHaveBeenCalled();
  });

  it("reveals an element the scroll flew past without ever intersecting", () => {
    // A fast scroll, an anchor jump or a restored scroll position can carry an
    // element clean above the viewport between two observer ticks; without this
    // it would stay invisible for the rest of the session.
    const { getByTestId } = render(<Probe />);
    fireTick(false, -1200);
    expect(visible(getByTestId("probe"))).toBe(true);
    expect(disconnect).toHaveBeenCalled();
  });

  it("stays hidden and keeps observing while still below the viewport", () => {
    const { getByTestId } = render(<Probe />);
    fireTick(false, 4000);
    expect(visible(getByTestId("probe"))).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<Probe />);
    disconnect.mockClear();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
