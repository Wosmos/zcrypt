import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/tauri", () => ({
  isTauri: false,
  pickFiles: vi.fn(),
  toDesktopFile: vi.fn(),
}));

import { UploadZone } from "@/components/upload/upload-zone";

function setup() {
  const onFiles = vi.fn();
  const { container } = render(<UploadZone onFiles={onFiles} />);
  const zone = screen.getByRole("button");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
  return { onFiles, zone, input, clickSpy };
}

const busy = (zone: HTMLElement) => zone.getAttribute("aria-busy") === "true";

describe("UploadZone preparing state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps preparing through a long phone-side preparation when the browser reports cancels", () => {
    const { zone } = setup();
    fireEvent.click(zone);
    expect(busy(zone)).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(90_000);
    });
    expect(busy(zone)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(busy(zone)).toBe(false);
  });

  it("hands the files over and stops preparing once they arrive", () => {
    const { zone, input, onFiles } = setup();
    fireEvent.click(zone);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(busy(zone)).toBe(false);
  });

  it("stops preparing when the picker is cancelled", () => {
    const { zone, input } = setup();
    fireEvent.click(zone);
    act(() => {
      input.dispatchEvent(new Event("cancel"));
    });
    expect(busy(zone)).toBe(false);
  });

  it("ignores taps while the picker is open but allows a new pick once it closed", () => {
    const { zone, clickSpy } = setup();
    fireEvent.click(zone);
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to a short guess on browsers without a cancel event", () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "oncancel");
    // @ts-expect-error simulate an older browser
    delete HTMLElement.prototype.oncancel;
    try {
      const { zone } = setup();
      fireEvent.click(zone);
      act(() => {
        window.dispatchEvent(new Event("focus"));
        vi.advanceTimersByTime(3_000);
      });
      expect(busy(zone)).toBe(false);
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, "oncancel", desc);
    }
  });
});
