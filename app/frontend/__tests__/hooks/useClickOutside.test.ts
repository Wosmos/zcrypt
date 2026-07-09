import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClickOutside } from "@/hooks/useClickOutside";

describe("useClickOutside", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function setup(enabled = true) {
    const inside = document.createElement("div");
    const child = document.createElement("span");
    inside.appendChild(child);
    const outside = document.createElement("div");
    document.body.append(inside, outside);

    const ref = { current: inside };
    const onOutside = vi.fn();
    const { unmount, rerender } = renderHook(
      ({ en }) => useClickOutside(ref, onOutside, en),
      { initialProps: { en: enabled } }
    );
    return { inside, child, outside, ref, onOutside, unmount, rerender };
  }

  function mousedown(target: Element) {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  }

  it("fires onOutside for a mousedown outside the element", () => {
    const { outside, onOutside } = setup();
    mousedown(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a mousedown on the element or its descendants", () => {
    const { inside, child, onOutside } = setup();
    mousedown(inside);
    mousedown(child);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("does not attach the listener when disabled", () => {
    const { outside, onOutside } = setup(false);
    mousedown(outside);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("does nothing when the ref is empty", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const ref = { current: null };
    const onOutside = vi.fn();
    renderHook(() => useClickOutside(ref, onOutside, true));
    mousedown(outside);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("re-subscribes when enabled toggles and detaches on unmount", () => {
    const { outside, onOutside, unmount, rerender } = setup(false);
    mousedown(outside);
    expect(onOutside).not.toHaveBeenCalled();

    rerender({ en: true });
    mousedown(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);

    unmount();
    mousedown(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});
