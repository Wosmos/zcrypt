import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAndroidShare } from "@/hooks/useAndroidShare";
import { SHARED_FILES_EVENT } from "@/lib/android";

type Win = Window & { ZcryptAndroid?: unknown };

function installBridge(batches: string[][]) {
  const takeSharedFiles = vi.fn(() => JSON.stringify(batches.shift() ?? []));
  (window as Win).ZcryptAndroid = {
    isScreenCaptureAllowed: () => false,
    setScreenCaptureAllowed: () => {},
    takeSharedFiles,
  };
  return takeSharedFiles;
}

describe("useAndroidShare", () => {
  afterEach(() => {
    cleanup();
    delete (window as Win).ZcryptAndroid;
  });

  it("does nothing outside the Android shell", () => {
    const onFiles = vi.fn();
    renderHook(() => useAndroidShare(onFiles, true));
    act(() => {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("waits until ready before collecting shares", () => {
    const take = installBridge([["/a.jpg"]]);
    const onFiles = vi.fn();
    const { rerender } = renderHook(({ ready }) => useAndroidShare(onFiles, ready), {
      initialProps: { ready: false },
    });
    expect(take).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(onFiles).toHaveBeenCalledWith(["/a.jpg"]);
  });

  it("drains pending shares on mount and every later share event", () => {
    const batches = [["/a.jpg"]];
    installBridge(batches);
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useAndroidShare(cb, true), {
      initialProps: { cb: first },
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(["/a.jpg"]);

    act(() => {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ cb: latest });
    batches.push(["/b.pdf", "/c.txt"]);
    act(() => {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    });
    expect(latest).toHaveBeenCalledWith(["/b.pdf", "/c.txt"]);

    unmount();
    batches.push(["/d.png"]);
    act(() => {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    });
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
