import { describe, it, expect, afterEach, vi } from "vitest";
import {
  androidBridge,
  isScreenCaptureAllowed,
  setScreenCaptureAllowed,
  takeSharedFiles,
} from "@/lib/android";

type Win = Window & { ZcryptAndroid?: unknown };

function installBridge(shared: string, allowed = false) {
  const bridge = {
    isScreenCaptureAllowed: vi.fn(() => allowed),
    setScreenCaptureAllowed: vi.fn(),
    takeSharedFiles: vi.fn(() => shared),
  };
  (window as Win).ZcryptAndroid = bridge;
  return bridge;
}

describe("android bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Win).ZcryptAndroid;
  });

  it("is absent outside the Android shell", () => {
    expect(androidBridge()).toBeNull();
    expect(takeSharedFiles()).toEqual([]);
    expect(isScreenCaptureAllowed()).toBeNull();
    expect(() => setScreenCaptureAllowed(true)).not.toThrow();
  });

  it("is absent without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(androidBridge()).toBeNull();
  });

  it("returns the shared paths and drops anything that is not a path", () => {
    installBridge(JSON.stringify(["/cache/shared/a/photo.jpg", "", 7, null, "/cache/shared/b/doc.pdf"]));
    expect(takeSharedFiles()).toEqual(["/cache/shared/a/photo.jpg", "/cache/shared/b/doc.pdf"]);
  });

  it("treats a non-array or malformed payload as nothing shared", () => {
    installBridge(JSON.stringify({ path: "/x" }));
    expect(takeSharedFiles()).toEqual([]);
    installBridge("not json");
    expect(takeSharedFiles()).toEqual([]);
  });

  it("reads and writes the screen capture setting through the shell", () => {
    const bridge = installBridge("[]", true);
    expect(isScreenCaptureAllowed()).toBe(true);
    setScreenCaptureAllowed(false);
    expect(bridge.setScreenCaptureAllowed).toHaveBeenCalledWith(false);
  });
});
