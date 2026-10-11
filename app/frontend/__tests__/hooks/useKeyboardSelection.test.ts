import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { KeyboardEvent, MouseEvent } from "react";
import { defaultIsTypingTarget, useKeyboardSelection } from "@/hooks/useKeyboardSelection";

const IDS = ["a", "b", "c", "d", "e", "f"];

function setup(over: Partial<Parameters<typeof useKeyboardSelection<string>>[0]> = {}) {
  const state = { selected: new Set<string>() };
  const onSelectedChange = vi.fn((next: Set<string>) => {
    state.selected = next;
  });
  const hook = renderHook(
    (props: { selected: Set<string> }) =>
      useKeyboardSelection<string>({
        ids: IDS,
        selected: props.selected,
        onSelectedChange,
        ...over,
      }),
    { initialProps: { selected: state.selected } },
  );
  const sync = () => hook.rerender({ selected: state.selected });
  return { hook, state, onSelectedChange, sync };
}

const click = (mods: Partial<MouseEvent> = {}) => mods as MouseEvent;
const key = (k: string, mods: Record<string, unknown> = {}) =>
  ({ key: k, preventDefault: vi.fn(), target: document.body, ...mods }) as unknown as KeyboardEvent;

describe("useKeyboardSelection", () => {
  it("plain click selects one", () => {
    const { hook, state } = setup();
    act(() => hook.result.current.onItemClick("b", click()));
    expect([...state.selected]).toEqual(["b"]);
  });

  it("Cmd/Ctrl click toggles", () => {
    const { hook, state, sync } = setup();
    act(() => hook.result.current.onItemClick("a", click({ metaKey: true })));
    sync();
    act(() => hook.result.current.onItemClick("c", click({ ctrlKey: true })));
    sync();
    expect([...state.selected].sort()).toEqual(["a", "c"]);
    act(() => hook.result.current.onItemClick("a", click({ metaKey: true })));
    expect([...state.selected]).toEqual(["c"]);
  });

  it("Shift click selects range from anchor", () => {
    const { hook, state, sync } = setup();
    act(() => hook.result.current.onItemClick("b", click()));
    sync();
    act(() => hook.result.current.onItemClick("e", click({ shiftKey: true })));
    expect([...state.selected].sort()).toEqual(["b", "c", "d", "e"]);
  });

  it("Shift+ArrowDown extends the selection", () => {
    const { hook, state, sync } = setup();
    act(() => hook.result.current.onItemClick("a", click()));
    sync();
    act(() => hook.result.current.onItemKeyDown("a", key("ArrowDown", { shiftKey: true })));
    sync();
    expect([...state.selected].sort()).toEqual(["a", "b"]);
    expect(hook.result.current.focusedId).toBe("b");
  });

  it("Cmd+A selects all and Esc clears", () => {
    const onEscape = vi.fn();
    const { hook, state, sync } = setup({ onEscape });
    act(() => hook.result.current.onContainerKeyDown(key("a", { metaKey: true })));
    sync();
    expect(state.selected.size).toBe(IDS.length);
    act(() => hook.result.current.onContainerKeyDown(key("Escape")));
    expect(state.selected.size).toBe(0);
    expect(onEscape).toHaveBeenCalled();
  });

  it("Delete calls onDelete with the selection", () => {
    const onDelete = vi.fn();
    const { hook, sync } = setup({ onDelete });
    act(() => hook.result.current.onItemClick("a", click({ metaKey: true })));
    sync();
    act(() => hook.result.current.onItemClick("b", click({ metaKey: true })));
    sync();
    act(() => hook.result.current.onItemKeyDown("a", key("Delete")));
    expect(onDelete).toHaveBeenCalledWith(["a", "b"]);
    act(() => hook.result.current.onItemKeyDown("c", key("Delete")));
    expect(onDelete).toHaveBeenLastCalledWith(["c"]);
  });

  it("ignores shortcuts while typing in an input", () => {
    const onDelete = vi.fn();
    const { hook, state } = setup({ onDelete });
    const input = document.createElement("input");
    act(() => hook.result.current.onContainerKeyDown(key("a", { metaKey: true, target: input })));
    act(() => hook.result.current.onItemKeyDown("a", key("Delete", { target: input })));
    expect(state.selected.size).toBe(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("steps by columns for Up/Down in a grid", () => {
    const { hook } = setup({ columns: 3 });
    act(() => hook.result.current.onItemKeyDown("a", key("ArrowDown")));
    expect(hook.result.current.focusedId).toBe("d");
    act(() => hook.result.current.onItemKeyDown("d", key("ArrowRight")));
    expect(hook.result.current.focusedId).toBe("e");
    act(() => hook.result.current.onItemKeyDown("e", key("ArrowUp")));
    expect(hook.result.current.focusedId).toBe("b");
  });

  it("Enter opens and getItemProps gives a roving tabindex", () => {
    const onOpen = vi.fn();
    const { hook } = setup({ onOpen });
    act(() => hook.result.current.onItemKeyDown("c", key("Enter")));
    expect(onOpen).toHaveBeenCalledWith("c");
    expect(hook.result.current.getItemProps("a").tabIndex).toBe(0);
    expect(hook.result.current.getItemProps("b").tabIndex).toBe(-1);
    act(() => hook.result.current.setFocusedId("b"));
    expect(hook.result.current.getItemProps("b").tabIndex).toBe(0);
    expect(hook.result.current.getItemProps("b")["data-focused"]).toBe(true);
  });

  describe("defaultIsTypingTarget", () => {
    it("recognises inputs, textareas and editable elements only", () => {
      expect(defaultIsTypingTarget(null)).toBe(false);
      expect(defaultIsTypingTarget("nope" as unknown as EventTarget)).toBe(false);
      expect(defaultIsTypingTarget(document.createElement("input"))).toBe(true);
      expect(defaultIsTypingTarget(document.createElement("textarea"))).toBe(true);
      expect(defaultIsTypingTarget({ tagName: "DIV", isContentEditable: true } as never)).toBe(true);
      expect(defaultIsTypingTarget(document.createElement("div"))).toBe(false);
    });
  });

  describe("focus tracking", () => {
    it("moves focus to the first item when the focused one disappears", () => {
      const onSelectedChange = vi.fn();
      const hook = renderHook(
        ({ ids }: { ids: string[] }) =>
          useKeyboardSelection<string>({ ids, selected: new Set(), onSelectedChange }),
        { initialProps: { ids: ["a", "b", "c"] } },
      );
      act(() => hook.result.current.setFocusedId("c"));
      hook.rerender({ ids: ["x", "y"] });
      expect(hook.result.current.focusedId).toBe("x");
      expect(hook.result.current.rovingId).toBe("x");
    });

    it("clears focus when the list empties and keeps it when the same ids are re-sent", () => {
      const onSelectedChange = vi.fn();
      const hook = renderHook(
        ({ ids }: { ids: string[] }) =>
          useKeyboardSelection<string>({ ids, selected: new Set(), onSelectedChange }),
        { initialProps: { ids: ["a", "b"] } },
      );
      act(() => hook.result.current.setFocusedId("b"));
      hook.rerender({ ids: ["a", "b"] });
      expect(hook.result.current.focusedId).toBe("b");
      hook.rerender({ ids: ["a", "b", "c"] });
      expect(hook.result.current.focusedId).toBe("b");
      hook.rerender({ ids: ["b", "a"] });
      expect(hook.result.current.focusedId).toBe("b");
      hook.rerender({ ids: [] });
      expect(hook.result.current.focusedId).toBeNull();
      expect(hook.result.current.rovingId).toBeNull();
    });

    it("does not touch focus on a new list when nothing was focused", () => {
      const hook = renderHook(
        ({ ids }: { ids: string[] }) =>
          useKeyboardSelection<string>({ ids, selected: new Set(), onSelectedChange: vi.fn() }),
        { initialProps: { ids: ["a"] } },
      );
      hook.rerender({ ids: ["z"] });
      expect(hook.result.current.focusedId).toBeNull();
      expect(hook.result.current.rovingId).toBe("z");
    });

    it("getItemProps wires click, key and focus handlers", () => {
      const { hook, state } = setup({ onOpen: vi.fn() });
      const props = hook.result.current.getItemProps("c");
      expect(props["aria-selected"]).toBe(false);
      expect("data-focused" in props).toBe(false);
      act(() => props.onClick(click()));
      expect([...state.selected]).toEqual(["c"]);
      act(() => props.onKeyDown(key("ArrowDown")));
      expect(hook.result.current.focusedId).toBe("d");
      act(() => props.onFocus({} as never));
      expect(hook.result.current.focusedId).toBe("c");
    });
  });

  describe("range selection", () => {
    it("selects from the clicked item when there is no anchor and walks backwards", () => {
      const { hook, state } = setup();
      act(() => hook.result.current.selectRangeTo("c", false));
      expect([...state.selected]).toEqual(["c"]);
      act(() => hook.result.current.onItemClick("e", click()));
      act(() => hook.result.current.selectRangeTo("c", false));
      expect([...state.selected].sort()).toEqual(["c", "d", "e"]);
    });

    it("ignores ranges whose ends are not selectable", () => {
      const { hook, onSelectedChange } = setup({ selectableIds: ["a", "b"] });
      act(() => hook.result.current.selectRangeTo("e", false));
      expect(onSelectedChange).not.toHaveBeenCalled();
      act(() => hook.result.current.onItemClick("a", click()));
      onSelectedChange.mockClear();
      act(() => hook.result.current.selectRangeTo("f", true));
      expect(onSelectedChange).not.toHaveBeenCalled();
    });

    it("Cmd+Shift click adds a range to the existing selection", () => {
      const { hook, state, sync } = setup();
      act(() => hook.result.current.onItemClick("a", click()));
      sync();
      act(() => hook.result.current.onItemClick("e", click({ metaKey: true })));
      sync();
      act(() => hook.result.current.onItemClick("c", click({ metaKey: true })));
      sync();
      act(() => hook.result.current.onItemClick("f", click({ shiftKey: true, metaKey: true })));
      expect([...state.selected].sort()).toEqual(["a", "c", "d", "e", "f"]);
    });
  });

  describe("keyboard on items", () => {
    it("Up/Down step by one in a list and Left/Right do nothing", () => {
      const { hook, onSelectedChange } = setup();
      const left = key("ArrowLeft");
      const right = key("ArrowRight");
      act(() => hook.result.current.onItemKeyDown("c", right));
      act(() => hook.result.current.onItemKeyDown("c", left));
      expect(left.preventDefault).not.toHaveBeenCalled();
      expect(right.preventDefault).not.toHaveBeenCalled();
      expect(hook.result.current.focusedId).toBeNull();
      act(() => hook.result.current.onItemKeyDown("c", key("ArrowUp")));
      expect(hook.result.current.focusedId).toBe("b");
      expect(onSelectedChange).not.toHaveBeenCalled();
    });

    it("ArrowLeft moves back in a grid", () => {
      const { hook } = setup({ columns: 3 });
      act(() => hook.result.current.onItemKeyDown("c", key("ArrowLeft")));
      expect(hook.result.current.focusedId).toBe("b");
    });

    it("Home and End jump to the ends, extending the selection with Shift", () => {
      const onSelectionStart = vi.fn();
      const { hook, state, sync } = setup({ onSelectionStart });
      act(() => hook.result.current.onItemKeyDown("c", key("End")));
      expect(hook.result.current.focusedId).toBe("f");
      act(() => hook.result.current.onItemKeyDown("c", key("Home")));
      expect(hook.result.current.focusedId).toBe("a");
      expect(onSelectionStart).not.toHaveBeenCalled();
      act(() => hook.result.current.onItemClick("c", click()));
      sync();
      act(() => hook.result.current.onItemKeyDown("c", key("End", { shiftKey: true })));
      expect([...state.selected].sort()).toEqual(["c", "d", "e", "f"]);
      expect(onSelectionStart).toHaveBeenCalled();
    });

    it("Home and End do nothing on an empty list", () => {
      const onSelectedChange = vi.fn();
      const hook = renderHook(() =>
        useKeyboardSelection<string>({ ids: [], selected: new Set(), onSelectedChange }),
      );
      const home = key("Home");
      act(() => hook.result.current.onItemKeyDown("x", home));
      act(() => hook.result.current.onItemKeyDown("x", key("End")));
      act(() => hook.result.current.moveFocus(null, 1, true));
      expect(home.preventDefault).toHaveBeenCalled();
      expect(hook.result.current.focusedId).toBeNull();
    });

    it("Space toggles the item and sets the anchor", () => {
      const onSelectionStart = vi.fn();
      const { hook, state, sync } = setup({ onSelectionStart });
      const space = key(" ");
      act(() => hook.result.current.onItemKeyDown("b", space));
      sync();
      expect(space.preventDefault).toHaveBeenCalled();
      expect([...state.selected]).toEqual(["b"]);
      expect(hook.result.current.anchorRef.current).toBe("b");
      expect(onSelectionStart).toHaveBeenCalledTimes(1);
      act(() => hook.result.current.onItemKeyDown("b", key(" ")));
      expect(state.selected.size).toBe(0);
    });

    it("Enter does nothing without an onOpen handler", () => {
      const { hook } = setup();
      const enter = key("Enter");
      act(() => hook.result.current.onItemKeyDown("a", enter));
      expect(enter.preventDefault).not.toHaveBeenCalled();
    });

    it("Escape on an item clears a selection but ignores an empty one", () => {
      const onEscape = vi.fn();
      const { hook, state, sync } = setup({ onEscape });
      const idle = key("Escape");
      act(() => hook.result.current.onItemKeyDown("a", idle));
      expect(idle.preventDefault).not.toHaveBeenCalled();
      expect(onEscape).not.toHaveBeenCalled();
      act(() => hook.result.current.onItemClick("a", click()));
      sync();
      act(() => hook.result.current.onItemKeyDown("a", key("Escape")));
      expect(state.selected.size).toBe(0);
      expect(hook.result.current.anchorRef.current).toBeNull();
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("Escape clears without an onEscape callback", () => {
      const { hook, state, sync } = setup();
      act(() => hook.result.current.onItemClick("a", click()));
      sync();
      act(() => hook.result.current.onItemKeyDown("a", key("Escape")));
      expect(state.selected.size).toBe(0);
    });

    it("Backspace deletes but Cmd+Backspace and missing onDelete do not", () => {
      const onDelete = vi.fn();
      const { hook } = setup({ onDelete });
      act(() => hook.result.current.onItemKeyDown("b", key("Backspace")));
      expect(onDelete).toHaveBeenCalledWith(["b"]);
      onDelete.mockClear();
      const meta = key("Backspace", { metaKey: true });
      act(() => hook.result.current.onItemKeyDown("b", meta));
      expect(onDelete).not.toHaveBeenCalled();
      expect(meta.preventDefault).not.toHaveBeenCalled();
      act(() => hook.result.current.onItemKeyDown("b", key("Delete", { metaKey: true })));
      expect(onDelete).toHaveBeenCalledWith(["b"]);

      const bare = setup();
      const del = key("Delete");
      act(() => bare.hook.result.current.onItemKeyDown("b", del));
      expect(del.preventDefault).not.toHaveBeenCalled();
    });

    it("ignores unrelated keys", () => {
      const { hook, onSelectedChange } = setup();
      const other = key("q");
      act(() => hook.result.current.onItemKeyDown("a", other));
      expect(other.preventDefault).not.toHaveBeenCalled();
      expect(onSelectedChange).not.toHaveBeenCalled();
    });
  });

  describe("keyboard on the container", () => {
    it("Ctrl+A (either case) selects every selectable id", () => {
      const { hook, state, sync } = setup({ selectableIds: ["a", "b"] });
      act(() => hook.result.current.onContainerKeyDown(key("A", { ctrlKey: true })));
      sync();
      expect([...state.selected]).toEqual(["a", "b"]);
    });

    it("Select-all does nothing with nothing selectable", () => {
      const { hook, onSelectedChange } = setup({ selectableIds: [] });
      const all = key("a", { metaKey: true });
      act(() => hook.result.current.onContainerKeyDown(all));
      act(() => hook.result.current.selectAll());
      expect(all.preventDefault).not.toHaveBeenCalled();
      expect(onSelectedChange).not.toHaveBeenCalled();
    });

    it("a plain 'a' or an idle Escape does nothing, Escape clears otherwise", () => {
      const onEscape = vi.fn();
      const { hook, state, sync } = setup({ onEscape });
      act(() => hook.result.current.onContainerKeyDown(key("a")));
      act(() => hook.result.current.onContainerKeyDown(key("Escape")));
      expect(onEscape).not.toHaveBeenCalled();
      act(() => hook.result.current.onItemClick("b", click()));
      sync();
      act(() => hook.result.current.onContainerKeyDown(key("Escape")));
      expect(state.selected.size).toBe(0);
      expect(onEscape).toHaveBeenCalledTimes(1);
      const quiet = setup();
      act(() => quiet.hook.result.current.onItemClick("b", click()));
      quiet.sync();
      act(() => quiet.hook.result.current.onContainerKeyDown(key("Escape")));
      expect(quiet.state.selected.size).toBe(0);
    });
  });

  describe("focusing the DOM element", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    });

    function runRaf() {
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    }

    it("focuses the element found through getItemElement", () => {
      runRaf();
      const el = document.createElement("button");
      document.body.append(el);
      const getItemElement = vi.fn(() => el);
      const { hook } = setup({ getItemElement });
      act(() => hook.result.current.moveFocus("a", 1, false));
      expect(getItemElement).toHaveBeenCalledWith("b");
      expect(document.activeElement).toBe(el);
    });

    it("falls back to a data-item-id lookup", () => {
      runRaf();
      const el = document.createElement("button");
      el.dataset.itemId = "b";
      document.body.append(el);
      const { hook } = setup();
      act(() => hook.result.current.moveFocus("a", 1, false));
      expect(document.activeElement).toBe(el);
    });

    it("does nothing when no element matches", () => {
      runRaf();
      const { hook } = setup();
      act(() => hook.result.current.moveFocus("a", 1, false));
      expect(document.activeElement).toBe(document.body);
    });

    it("tolerates a missing document when the frame fires", () => {
      let frame: FrameRequestCallback = () => {};
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        frame = cb;
        return 0;
      });
      const { hook } = setup();
      act(() => hook.result.current.moveFocus("a", 1, false));
      const real = globalThis.document;
      vi.stubGlobal("document", undefined);
      try {
        expect(() => frame(0)).not.toThrow();
      } finally {
        vi.stubGlobal("document", real);
      }
    });

    it("moveFocus starts from the first item when the origin is unknown", () => {
      runRaf();
      const { hook } = setup();
      act(() => hook.result.current.moveFocus("zzz", 2, false));
      expect(hook.result.current.focusedId).toBe("c");
      act(() => hook.result.current.moveFocus(null, 1, false));
      expect(hook.result.current.focusedId).toBe("b");
    });

    it("Shift-moving onto an unselectable id leaves the selection alone", () => {
      runRaf();
      const { hook, onSelectedChange } = setup({ selectableIds: ["a"] });
      act(() => hook.result.current.moveFocus("a", 1, true));
      expect(onSelectedChange).not.toHaveBeenCalled();
    });
  });
});
