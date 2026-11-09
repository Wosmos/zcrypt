import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

function open(onSelect: () => void, onPointerUp?: () => void) {
  render(
    <ContextMenu>
      <ContextMenuTrigger>file.txt</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onSelect} onPointerUp={onPointerUp}>
          Open
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText("file.txt"));
  return screen.getByRole("menuitem", { name: "Open" });
}

describe("ContextMenuItem", () => {
  afterEach(cleanup);

  it("ignores the right button's release, so a right-click never opens the item", () => {
    const onSelect = vi.fn();
    const onPointerUp = vi.fn();
    const item = open(onSelect, onPointerUp);
    fireEvent.pointerUp(item, { button: 2, pointerType: "mouse" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onPointerUp).toHaveBeenCalled();
  });

  it("still selects on the main button", () => {
    const onSelect = vi.fn();
    const item = open(onSelect);
    fireEvent.pointerUp(item, { button: 0, pointerType: "mouse" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
