import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDragMove, canDrop, setDragGhost, DRAG_MIME, type DragItem } from "@/hooks/useDragMove";

describe("useDragMove store", () => {
  beforeEach(() => {
    useDragMove.setState({ dragging: null, overTarget: undefined });
  });

  it("starts with no dragging item and an undefined drop target", () => {
    const { result } = renderHook(() => useDragMove());
    expect(result.current.dragging).toBeNull();
    expect(result.current.overTarget).toBeUndefined();
  });

  it("startDrag sets the dragging item", () => {
    const { result } = renderHook(() => useDragMove());
    const item: DragItem = { kind: "file", id: "f1", name: "a.txt" };
    act(() => result.current.startDrag(item));
    expect(result.current.dragging).toEqual(item);
  });

  it("endDrag clears dragging and overTarget", () => {
    const { result } = renderHook(() => useDragMove());
    act(() => {
      result.current.startDrag({ kind: "folder", id: "d1", name: "Docs" });
      result.current.setOverTarget("d2");
    });
    expect(result.current.dragging).not.toBeNull();
    expect(result.current.overTarget).toBe("d2");

    act(() => result.current.endDrag());
    expect(result.current.dragging).toBeNull();
    expect(result.current.overTarget).toBeUndefined();
  });

  it("setOverTarget accepts null (Root crumb) and a folder id", () => {
    const { result } = renderHook(() => useDragMove());
    act(() => result.current.setOverTarget(null));
    expect(result.current.overTarget).toBeNull();
    act(() => result.current.setOverTarget("folder-9"));
    expect(result.current.overTarget).toBe("folder-9");
  });
});

describe("canDrop", () => {
  it("returns false when there is no dragged item", () => {
    expect(canDrop(null, "dest")).toBe(false);
  });

  it("returns false for a folder dropped onto itself", () => {
    const item: DragItem = { kind: "folder", id: "d1", name: "Docs", parentId: "root" };
    expect(canDrop(item, "d1")).toBe(false);
  });

  it("returns false for a folder dropped onto its current parent (no-op)", () => {
    const item: DragItem = { kind: "folder", id: "d1", name: "Docs", parentId: "p1" };
    expect(canDrop(item, "p1")).toBe(false);
  });

  it("treats a missing parentId as root when comparing to a null destination", () => {
    const item: DragItem = { kind: "folder", id: "d1", name: "Docs" };
    expect(canDrop(item, null)).toBe(false);
  });

  it("allows a folder drop onto an unrelated destination", () => {
    const item: DragItem = { kind: "folder", id: "d1", name: "Docs", parentId: "p1" };
    expect(canDrop(item, "p2")).toBe(true);
  });

  it("always allows a file drop", () => {
    const item: DragItem = { kind: "file", id: "f1", name: "a.txt" };
    expect(canDrop(item, "anything")).toBe(true);
    expect(canDrop(item, null)).toBe(true);
  });
});

describe("DRAG_MIME", () => {
  it("is the expected custom mime type", () => {
    expect(DRAG_MIME).toBe("application/x-zcrypt-move");
  });
});

describe("setDragGhost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("no-ops in an SSR context where document is undefined", () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error -- simulate an SSR environment for this one call
    delete globalThis.document;
    expect(() =>
      setDragGhost({ dataTransfer: {} as DataTransfer }, { tilt: true })
    ).not.toThrow();
    globalThis.document = originalDocument;
  });

  it("no-ops when the event has no dataTransfer", () => {
    expect(() =>
      setDragGhost({ dataTransfer: undefined as unknown as DataTransfer }, { tilt: true })
    ).not.toThrow();
    expect(document.body.children.length).toBe(0);
  });

  it("no-ops when dataTransfer.setDragImage is not a function", () => {
    expect(() =>
      setDragGhost({ dataTransfer: {} as DataTransfer }, { tilt: true })
    ).not.toThrow();
    expect(document.body.children.length).toBe(0);
  });

  it("builds a single-folder ghost with a label and registers it as the drag image", () => {
    vi.useFakeTimers();
    const setDragImage = vi.fn();
    setDragGhost(
      { dataTransfer: { setDragImage } as unknown as DataTransfer },
      { tilt: true, kind: "folder", label: "My Folder" }
    );

    expect(setDragImage).toHaveBeenCalledTimes(1);
    const [node, x, y] = setDragImage.mock.calls[0];
    expect(x).toBe(42);
    expect(y).toBe(35);
    expect(node.textContent).toContain("My Folder");
    expect(document.body.contains(node)).toBe(true);

    act(() => vi.advanceTimersByTime(0));
    expect(document.body.contains(node)).toBe(false);
  });

  it("builds a single-folder ghost without a label", () => {
    const setDragImage = vi.fn();
    setDragGhost(
      { dataTransfer: { setDragImage } as unknown as DataTransfer },
      { tilt: false, kind: "folder" }
    );
    const [node] = setDragImage.mock.calls[0];
    expect(node.querySelector("svg")).not.toBeNull();
    expect(node.children.length).toBe(1); // svg only, no label div
  });

  it("swallows a setDragImage failure on the single-folder path", () => {
    const setDragImage = vi.fn(() => {
      throw new Error("not supported");
    });
    expect(() =>
      setDragGhost(
        { dataTransfer: { setDragImage } as unknown as DataTransfer },
        { tilt: true, kind: "folder", label: "X" }
      )
    ).not.toThrow();
  });

  it("builds a bulk stacked ghost (>=2 items) even when kind is folder", () => {
    const setDragImage = vi.fn();
    setDragGhost(
      { dataTransfer: { setDragImage } as unknown as DataTransfer },
      { tilt: true, kind: "folder", count: 4 }
    );
    const [node, x, y] = setDragImage.mock.calls[0];
    expect(x).toBe(24);
    expect(y).toBe(20);
    expect(node.textContent).toContain("4 items");
    // Two stacked backing cards plus the front card.
    expect(node.children.length).toBe(3);
  });

  it("builds a single-file ghost with a default label when none is given", () => {
    const setDragImage = vi.fn();
    setDragGhost(
      { dataTransfer: { setDragImage } as unknown as DataTransfer },
      { tilt: false }
    );
    const [node] = setDragImage.mock.calls[0];
    expect(node.textContent).toContain("1 item");
    // No stacked backing cards for a single item.
    expect(node.children.length).toBe(1);
  });

  it("builds a single-file ghost with a custom label", () => {
    const setDragImage = vi.fn();
    setDragGhost(
      { dataTransfer: { setDragImage } as unknown as DataTransfer },
      { tilt: true, label: "report.pdf" }
    );
    const [node] = setDragImage.mock.calls[0];
    expect(node.textContent).toContain("report.pdf");
  });

  it("swallows a setDragImage failure on the generic ghost path and still schedules cleanup", () => {
    vi.useFakeTimers();
    const setDragImage = vi.fn(() => {
      throw new Error("nope");
    });
    expect(() =>
      setDragGhost(
        { dataTransfer: { setDragImage } as unknown as DataTransfer },
        { tilt: true, count: 3 }
      )
    ).not.toThrow();
    const node = document.body.lastElementChild!;
    expect(document.body.contains(node)).toBe(true);
    act(() => vi.advanceTimersByTime(0));
    expect(document.body.contains(node)).toBe(false);
  });
});
