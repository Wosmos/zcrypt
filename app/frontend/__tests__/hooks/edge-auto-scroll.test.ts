import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createEdgeAutoScroll } from "@/hooks/edge-auto-scroll";

// Drive requestAnimationFrame manually so each "frame" (tick) runs on demand.
let rafCb: FrameRequestCallback | null = null;
let nextId = 0;
const raf = vi.fn((cb: FrameRequestCallback) => {
  rafCb = cb;
  return ++nextId;
});
const caf = vi.fn();

function runFrame() {
  const cb = rafCb;
  rafCb = null;
  cb?.(performance.now());
}

function scrollerAt(top: number, bottom: number) {
  const el = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top, bottom } as DOMRect),
  } as unknown as HTMLElement;
  return el;
}

beforeEach(() => {
  rafCb = null;
  nextId = 0;
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  raf.mockClear();
  caf.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("createEdgeAutoScroll", () => {
  function make(over: Partial<Parameters<typeof createEdgeAutoScroll>[0]> = {}) {
    const onScrolled = vi.fn();
    const scroller = scrollerAt(100, 500);
    const s = createEdgeAutoScroll({
      isActive: () => true,
      getScroller: () => scroller,
      getPoint: () => ({ x: 0, y: 300 }), // mid-zone by default → no scroll
      onScrolled,
      ...over,
    });
    return { s, onScrolled, scroller };
  }

  it("start() schedules a frame; a second start() while running is a no-op", () => {
    const { s } = make();
    s.start();
    expect(raf).toHaveBeenCalledTimes(1);
    s.start(); // raf handle is non-null → must NOT schedule again
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("scrolls up and re-runs the hit-test when the finger is in the top edge zone", () => {
    const { s, onScrolled, scroller } = make({ getPoint: () => ({ x: 5, y: 110 }) });
    s.start();
    runFrame();
    expect(scroller.scrollTop).toBe(-14); // EDGE_SPEED up
    expect(onScrolled).toHaveBeenCalledWith(5, 110);
    expect(raf).toHaveBeenCalledTimes(2); // reschedules for the next frame
  });

  it("scrolls down when the finger is in the bottom edge zone", () => {
    const { s, onScrolled, scroller } = make({ getPoint: () => ({ x: 5, y: 490 }) });
    s.start();
    runFrame();
    expect(scroller.scrollTop).toBe(14); // EDGE_SPEED down
    expect(onScrolled).toHaveBeenCalledWith(5, 490);
  });

  it("does not scroll when the finger is outside both edge zones", () => {
    const { s, onScrolled, scroller } = make({ getPoint: () => ({ x: 5, y: 300 }) });
    s.start();
    runFrame();
    expect(scroller.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
    expect(raf).toHaveBeenCalledTimes(2); // still keeps looping
  });

  it("stops the loop when isActive() goes false", () => {
    let active = true;
    const { s } = make({ isActive: () => active });
    s.start();
    active = false;
    runFrame(); // tick sees inactive → clears raf, does not reschedule
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("stops the loop when the scroller disappears", () => {
    const { s } = make({ getScroller: () => null });
    s.start();
    runFrame();
    expect(raf).toHaveBeenCalledTimes(1); // no reschedule
  });

  it("stop() cancels a running loop; stop() when idle is a no-op", () => {
    const { s } = make();
    s.start();
    s.stop();
    expect(caf).toHaveBeenCalledTimes(1);
    s.stop(); // already stopped → nothing to cancel
    expect(caf).toHaveBeenCalledTimes(1);
  });
});
