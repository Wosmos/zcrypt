import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, fireEvent } from "@testing-library/react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { useTouchRangeSelect } from "@/hooks/useTouchRangeSelect";

const MOVE_START = 8; // MOVE_START_PX in the hook
const BELOW_START = 5; // < MOVE_START: still a tap
const ABOVE_START = 12; // > MOVE_START: commits to a sweep

// The file id `fileIdAt` should report for the next point read. Tests set this
// before dispatching a move to simulate the finger entering a given card.
let pointId: string | null = "f0";
const fileIdAt = vi.fn(() => pointId);
const onSweepStart = vi.fn();
const onSweep = vi.fn();

function touchEvent(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as ReactTouchEvent;
}
function press(
  onPressStart: (id: string, e: ReactTouchEvent) => void,
  id = "f0",
  x = 0,
  y = 0
) {
  act(() => onPressStart(id, touchEvent(x, y)));
}
function moveDoc(x: number, y: number) {
  act(() => fireEvent.touchMove(document, { touches: [{ clientX: x, clientY: y }] }));
}
function endDoc() {
  act(() => fireEvent.touchEnd(document));
}
function cancelDoc() {
  act(() => fireEvent.touchCancel(document));
}

// Manual requestAnimationFrame queue so the auto-scroll loop is deterministic
// (mirrors the useTouchDragMove test harness).
let rafQueue: Map<number, FrameRequestCallback>;
let rafId: number;

beforeEach(() => {
  vi.useFakeTimers();
  rafQueue = new Map();
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue.delete(id);
  });
  pointId = "f0";
  fileIdAt.mockClear();
  onSweepStart.mockClear();
  onSweep.mockClear();
});

afterEach(() => {
  // Tear down any press left active by a test that never released — otherwise its
  // document touch listeners linger and, because the mocks are module-level, fire
  // again during the next test (cross-test pollution).
  try {
    fireEvent.touchCancel(document);
  } catch {
    /* no active press */
  }
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function flushRaf() {
  const cbs = Array.from(rafQueue.values());
  rafQueue.clear();
  cbs.forEach((cb) => act(() => cb(0)));
}

function mount(enabled = true) {
  return renderHook(() =>
    useTouchRangeSelect({ enabled, fileIdAt, onSweepStart, onSweep })
  );
}

describe("useTouchRangeSelect", () => {
  it("is a no-op when disabled", () => {
    const { result } = mount(false);
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    expect(onSweepStart).not.toHaveBeenCalled();
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("ignores a press with no touch point", () => {
    const { result } = mount();
    expect(() =>
      act(() => result.current.onPressStart("f0", { touches: [] } as unknown as ReactTouchEvent))
    ).not.toThrow();
    moveDoc(0, ABOVE_START);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("a plain tap (move under the slop) does not start a sweep", () => {
    const { result } = mount();
    press(result.current.onPressStart, "f0");
    moveDoc(0, BELOW_START);
    endDoc();
    expect(onSweepStart).not.toHaveBeenCalled();
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("a move past the slop starts a sweep and selects from the anchor", () => {
    const { result } = mount();
    pointId = "f0"; // finger still over the anchor card as the sweep begins
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    expect(onSweepStart).toHaveBeenCalledTimes(1);
    // The anchor card is in the range from the first move.
    expect(onSweep).toHaveBeenCalledWith("f0", "f0");
  });

  it("dispatches once per NEW card entered, de-duping same-card moves", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START); // sweep begins → onSweep(f0, f0)
    onSweep.mockClear();

    moveDoc(0, ABOVE_START + 4); // same card f0 → no new dispatch
    expect(onSweep).not.toHaveBeenCalled();

    pointId = "f3";
    moveDoc(0, ABOVE_START + 8); // entered f3
    expect(onSweep).toHaveBeenCalledTimes(1);
    expect(onSweep).toHaveBeenLastCalledWith("f0", "f3");

    moveDoc(0, ABOVE_START + 12); // still f3 → no dispatch
    expect(onSweep).toHaveBeenCalledTimes(1);
  });

  it("re-dispatches when sweeping back to an earlier card", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START); // f0
    pointId = "f4";
    moveDoc(0, 60); // f4
    onSweep.mockClear();
    pointId = "f2";
    moveDoc(0, 40); // back to f2 → dispatch
    expect(onSweep).toHaveBeenLastCalledWith("f0", "f2");
  });

  it("ignores points that are not over a file card (null)", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START); // f0
    onSweep.mockClear();
    pointId = null; // finger over a gap / folder
    moveDoc(0, 50);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("only calls onSweepStart once per sweep", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    pointId = "f1";
    moveDoc(0, 40);
    pointId = "f2";
    moveDoc(0, 60);
    expect(onSweepStart).toHaveBeenCalledTimes(1);
  });

  it("a fresh press tears down a stale, un-swept press first", () => {
    const { result } = mount();
    press(result.current.onPressStart, "f0"); // never moved
    press(result.current.onPressStart, "f9", 0, 100); // new anchor
    pointId = "f9";
    moveDoc(0, 100 + ABOVE_START);
    expect(onSweep).toHaveBeenLastCalledWith("f9", "f9");
  });

  it("ignores a touchmove with no active touch point", () => {
    const { result } = mount();
    press(result.current.onPressStart, "f0");
    expect(() => act(() => fireEvent.touchMove(document, { touches: [] }))).not.toThrow();
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("touchend ends the sweep so later moves are ignored", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    endDoc();
    onSweep.mockClear();
    pointId = "f5";
    moveDoc(0, 80);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("touchcancel ends the sweep the same way touchend does", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    cancelDoc();
    onSweep.mockClear();
    pointId = "f5";
    moveDoc(0, 80);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("auto-scrolls near the bottom edge and re-selects under the finger", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    scroller.getBoundingClientRect = () =>
      ({ top: 0, bottom: 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(scroller);

    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0", 0, 150);
    moveDoc(0, 150 + ABOVE_START); // commit mid-container — a frame is scheduled
    expect(rafQueue.size).toBe(1);

    // Move into the bottom edge zone (dispatches for the card there, f7).
    pointId = "f7";
    moveDoc(0, 290);
    onSweep.mockClear();
    // The scroll slides a NEW card (f9) under the stationary finger; the frame
    // scrolls and re-selects to it.
    pointId = "f9";
    flushRaf();
    expect(scroller.scrollTop).toBe(14);
    expect(onSweep).toHaveBeenLastCalledWith("f0", "f9");
    expect(rafQueue.size).toBe(1); // reschedules itself
  });

  it("the auto-scroll tick no-ops when the scroll container is missing", () => {
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START); // sweeping, but no #main-content in the DOM
    expect(rafQueue.size).toBe(1);
    flushRaf();
    expect(rafQueue.size).toBe(0); // scroller null → no reschedule
  });

  it("does not scroll when clear of both edges", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    scroller.getBoundingClientRect = () =>
      ({ top: 0, bottom: 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(scroller);

    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0", 0, 150);
    moveDoc(0, 150 + ABOVE_START); // mid-container, no edge
    flushRaf();
    expect(scroller.scrollTop).toBe(0);
  });

  it("a stale auto-scroll tick after the sweep ended does not throw", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    document.body.appendChild(scroller);
    const { result } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    moveDoc(0, ABOVE_START);
    const staleTick = Array.from(rafQueue.values())[0]!;
    endDoc(); // teardown cancels the frame
    expect(() => act(() => staleTick(0))).not.toThrow();
  });

  it("reads the latest onSweep via ref, not the one from press time", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }) => useTouchRangeSelect({ enabled: true, fileIdAt, onSweepStart, onSweep: cb }),
      { initialProps: { cb: stale } }
    );
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    rerender({ cb: fresh });
    moveDoc(0, ABOVE_START);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledWith("f0", "f0");
  });

  it("stops firing once disabled after mount", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useTouchRangeSelect({ enabled, fileIdAt, onSweepStart, onSweep }),
      { initialProps: { enabled: true } }
    );
    rerender({ enabled: false });
    press(result.current.onPressStart, "f0"); // guarded by the fresh `enabled`
    moveDoc(0, ABOVE_START);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("tears down document listeners on unmount", () => {
    const { result, unmount } = mount();
    pointId = "f0";
    press(result.current.onPressStart, "f0");
    unmount();
    onSweep.mockClear();
    pointId = "f5";
    moveDoc(0, 80);
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("unmounts cleanly when nothing was ever pressed", () => {
    const { unmount } = mount();
    expect(() => unmount()).not.toThrow();
  });
});
