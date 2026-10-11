import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useKeyboardSelection } from "@/hooks/useKeyboardSelection";

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
});
