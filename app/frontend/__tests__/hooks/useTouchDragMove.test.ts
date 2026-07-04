import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, fireEvent } from "@testing-library/react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { useTouchDragMove } from "@/hooks/useTouchDragMove";
import { useDragMove, type DragItem } from "@/hooks/useDragMove";

const HOLD_MS = 220;
const BELOW_CANCEL = 5; // < MOVE_CANCEL_PX(12): jitter, stays armed
const ABOVE_CANCEL = 20; // > MOVE_CANCEL_PX(12): treated as a scroll
const ABOVE_DRAG_START = 10; // > DRAG_START_PX(6): commits to a drag

const file: DragItem = { kind: "file", id: "f1", name: "report.pdf" };

function touchEvent(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as ReactTouchEvent;
}

function press(onPressStart: (item: DragItem, e: ReactTouchEvent) => void, x = 0, y = 0, item = file) {
  act(() => onPressStart(item, touchEvent(x, y)));
}

function moveDoc(x: number, y: number) {
  fireEvent.touchMove(document, { touches: [{ clientX: x, clientY: y }] });
}

function endDocTouch() {
  fireEvent.touchEnd(document);
}

function cancelDocTouch() {
  fireEvent.touchCancel(document);
}

function commitDrag(onPressStart: (item: DragItem, e: ReactTouchEvent) => void, item = file) {
  press(onPressStart, 0, 300, item);
  act(() => vi.advanceTimersByTime(HOLD_MS));
  act(() => moveDoc(0, 300 + ABOVE_DRAG_START));
}

// requestAnimationFrame is unimplemented as real async browser scheduling in
// this jsdom setup would make the auto-scroll loop nondeterministic; a manual
// queue gives each test exact control over when a "frame" ticks.
let rafQueue: Map<number, FrameRequestCallback>;
let rafId: number;

beforeEach(() => {
  // vi.useFakeTimers() fakes requestAnimationFrame too, so it must run BEFORE
  // the manual rAF stub below or the fake-timer version wins and the queue
  // never sees a callback.
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
  document.elementFromPoint = vi.fn(() => null);
  useDragMove.setState({ dragging: null, overTarget: undefined });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // @ts-expect-error -- test-only stub, not part of the real jsdom document type
  delete document.elementFromPoint;
});

function flushRaf() {
  const cbs = Array.from(rafQueue.values());
  rafQueue.clear();
  cbs.forEach((cb) => act(() => cb(0)));
}

function makeFolder(id: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-folder-drop", id);
  document.body.appendChild(el);
  return el;
}

describe("useTouchDragMove", () => {
  it("is a no-op when disabled", () => {
    const canDropOn = vi.fn(() => true);
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: false, canDropOn, onDrop })
    );

    press(result.current.onPressStart);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, 100));

    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("ignores a press with no touch point", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    expect(() =>
      act(() => result.current.onPressStart(file, { touches: [] } as unknown as ReactTouchEvent))
    ).not.toThrow();
    act(() => moveDoc(0, 100));
    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("a fresh press tears down a stale, un-dragged press first", () => {
    const other: DragItem = { kind: "file", id: "f2", name: "other.txt" };
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0, file);
    commitDrag(result.current.onPressStart, other);

    expect(useDragMove.getState().dragging).toEqual(other);
  });

  it("treats a move past the cancel threshold before the hold as a scroll", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    act(() => moveDoc(0, ABOVE_CANCEL));
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, ABOVE_CANCEL + ABOVE_DRAG_START));

    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("small jitter before the hold does not cancel the press", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    act(() => moveDoc(0, BELOW_CANCEL));
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, BELOW_CANCEL + ABOVE_DRAG_START));

    expect(useDragMove.getState().dragging).toEqual(file);
  });

  it("commits to a drag after the hold fires and a deliberate move follows", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    commitDrag(result.current.onPressStart);

    expect(useDragMove.getState().dragging).toEqual(file);
    expect(document.body.textContent).toContain("report.pdf");
    expect(rafQueue.size).toBe(1);
  });

  it("a move before the hold fires without exceeding the cancel threshold, and before dragging, does nothing", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    act(() => moveDoc(0, 1));
    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("a held move under the drag-start threshold does not yet commit, but a further move does", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, 3)); // held, but under DRAG_START_PX(6) — no commit yet
    expect(useDragMove.getState().dragging).toBeNull();

    act(() => moveDoc(0, 3 + ABOVE_DRAG_START));
    expect(useDragMove.getState().dragging).toEqual(file);
  });

  it("ignores a touchmove with no active touch point", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    expect(() => act(() => fireEvent.touchMove(document, { touches: [] }))).not.toThrow();
    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("highlights a droppable folder under the finger and clears it when moved away", () => {
    const canDropOn = vi.fn(() => true);
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn, onDrop: vi.fn() })
    );
    const folder = makeFolder("folder-1");
    commitDrag(result.current.onPressStart);

    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(folder);
    act(() => moveDoc(10, 320));
    expect(useDragMove.getState().overTarget).toBe("folder-1");
    expect(canDropOn).toHaveBeenCalledWith(file, "folder-1");

    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(null);
    act(() => moveDoc(10, 330));
    expect(useDragMove.getState().overTarget).toBeUndefined();
  });

  it("does not highlight a folder the item cannot be dropped on", () => {
    const canDropOn = vi.fn(() => false);
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn, onDrop: vi.fn() })
    );
    const folder = makeFolder("folder-1");
    commitDrag(result.current.onPressStart);

    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(folder);
    act(() => moveDoc(10, 320));
    expect(useDragMove.getState().overTarget).toBeUndefined();
  });

  it("drops onto a valid folder target on release and resets drag state", () => {
    const canDropOn = vi.fn(() => true);
    const onDrop = vi.fn();
    const { result } = renderHook(() => useTouchDragMove({ enabled: true, canDropOn, onDrop }));
    const folder = makeFolder("folder-1");
    commitDrag(result.current.onPressStart);
    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(folder);

    act(() => endDocTouch());

    expect(onDrop).toHaveBeenCalledWith(file, "folder-1");
    expect(useDragMove.getState().dragging).toBeNull();
    expect(useDragMove.getState().overTarget).toBeUndefined();
    expect(document.body.textContent).not.toContain("report.pdf");
  });

  it("releasing without hovering a valid target does not call onDrop", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop })
    );
    commitDrag(result.current.onPressStart);

    act(() => endDocTouch());

    expect(onDrop).not.toHaveBeenCalled();
    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("releasing before a drag ever started does not call onDrop", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop })
    );
    press(result.current.onPressStart, 0, 0);

    act(() => endDocTouch());

    expect(onDrop).not.toHaveBeenCalled();
    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("touchcancel resets drag state the same way touchend does", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop })
    );
    commitDrag(result.current.onPressStart);
    expect(useDragMove.getState().dragging).toEqual(file);

    act(() => cancelDocTouch());

    expect(useDragMove.getState().dragging).toBeNull();
  });

  it("suppresses the context menu once dragging, but not before", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 0);
    expect(fireEvent.contextMenu(document)).toBe(true);

    commitDrag(result.current.onPressStart);
    expect(fireEvent.contextMenu(document)).toBe(false);
  });

  it("auto-scrolls the container when dragging near its top edge and reschedules the next frame", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    scroller.getBoundingClientRect = () =>
      ({ top: 100, bottom: 400, left: 0, right: 0, width: 0, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(scroller);

    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 300);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, 110)); // commits the drag near the top edge

    flushRaf();
    expect(scroller.scrollTop).toBe(-14);
    expect(rafQueue.size).toBe(1); // tickAutoScroll rescheduled itself
  });

  it("auto-scrolls toward the bottom edge and no-ops when clear of both edges", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    scroller.getBoundingClientRect = () =>
      ({ top: 0, bottom: 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(scroller);

    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    press(result.current.onPressStart, 0, 150);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => moveDoc(0, 150 + ABOVE_DRAG_START)); // commits mid-container, no edge

    flushRaf();
    expect(scroller.scrollTop).toBe(0);

    act(() => moveDoc(0, 280)); // now within the bottom edge zone
    flushRaf();
    expect(scroller.scrollTop).toBe(14);
  });

  it("the auto-scroll tick no-ops when the named scroll container is missing", () => {
    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn(), scrollContainerId: "does-not-exist" })
    );

    commitDrag(result.current.onPressStart);
    expect(rafQueue.size).toBe(1);

    flushRaf();
    expect(rafQueue.size).toBe(0); // scroller is null, so no frame is rescheduled
  });

  it("the auto-scroll tick no-ops if it fires after the drag has already ended", () => {
    const scroller = document.createElement("div");
    scroller.id = "main-content";
    document.body.appendChild(scroller);

    const { result } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    commitDrag(result.current.onPressStart);
    const staleTick = Array.from(rafQueue.values())[0]!;

    act(() => endDocTouch()); // teardown cancels the scheduled frame

    expect(() => act(() => staleTick(0))).not.toThrow();
  });

  it("tears down an in-flight drag on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );

    commitDrag(result.current.onPressStart);
    expect(useDragMove.getState().dragging).toEqual(file);

    unmount();

    expect(useDragMove.getState().dragging).toBeNull();
    expect(document.body.textContent).not.toContain("report.pdf");
  });

  it("unmounts cleanly when nothing was ever pressed", () => {
    const { unmount } = renderHook(() =>
      useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn() })
    );
    expect(() => unmount()).not.toThrow();
  });

  it("reads the latest canDropOn/onDrop/enabled via ref on drop, not the ones from press time", () => {
    const staleCanDropOn = vi.fn(() => false);
    const staleOnDrop = vi.fn();
    const freshCanDropOn = vi.fn(() => true);
    const freshOnDrop = vi.fn();

    const { result, rerender } = renderHook(
      ({ canDropOn, onDrop }) => useTouchDragMove({ enabled: true, canDropOn, onDrop }),
      { initialProps: { canDropOn: staleCanDropOn, onDrop: staleOnDrop } }
    );
    const folder = makeFolder("folder-1");
    commitDrag(result.current.onPressStart);

    rerender({ canDropOn: freshCanDropOn, onDrop: freshOnDrop });

    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(folder);
    act(() => endDocTouch());

    expect(staleOnDrop).not.toHaveBeenCalled();
    expect(freshCanDropOn).toHaveBeenCalledWith(file, "folder-1");
    expect(freshOnDrop).toHaveBeenCalledWith(file, "folder-1");
  });

  it("a touchmove from a listener orphaned by a scrollContainerId change still no-ops once the press it belonged to is torn down", () => {
    // beginDrag's identity depends on scrollContainerId, so changing it reruns
    // the effect that reassigns onMoveRef/onEndRef/onCtxRef.current to NEW
    // closures — but the OLD closure is what's actually attached to `document`
    // (nothing re-attaches it on a prop change). A later teardown() reads
    // onMoveRef.current fresh, so its removeEventListener call targets the NEW
    // closure and silently fails to detach the OLD one, leaking it. The OLD
    // closure still shares the same underlying press state, so once that state
    // is torn down (item nulled), the leaked listener must see the null item
    // and bail out instead of acting on stale state.
    const { result, rerender } = renderHook(
      ({ scrollContainerId }) =>
        useTouchDragMove({ enabled: true, canDropOn: () => true, onDrop: vi.fn(), scrollContainerId }),
      { initialProps: { scrollContainerId: "main-content" } }
    );

    press(result.current.onPressStart, 0, 0);
    rerender({ scrollContainerId: "other-container" });
    act(() => endDocTouch()); // torn down via the OLD (still-attached) onEndRef closure

    expect(() => act(() => moveDoc(5, 5))).not.toThrow();
    expect(useDragMove.getState().dragging).toBeNull();
  });
});
