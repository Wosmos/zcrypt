import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A fake WakeLockSentinel that records release() and lets tests fire the OS
// 'release' event (which happens when the tab is hidden).
class FakeSentinel {
  released = false;
  private listeners: (() => void)[] = [];
  release = vi.fn(async () => {
    this.released = true;
    this.listeners.forEach((l) => l());
  });
  addEventListener(_type: "release", cb: () => void) {
    this.listeners.push(cb);
  }
  fireOSRelease() {
    this.released = true;
    this.listeners.forEach((l) => l());
  }
}

let requestMock: ReturnType<typeof vi.fn>;
let sentinels: FakeSentinel[];

function installWakeLock() {
  sentinels = [];
  requestMock = vi.fn(async () => {
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", {
    value: { request: requestMock },
    configurable: true,
    writable: true,
  });
}

function removeWakeLock() {
  // Delete the property so `"wakeLock" in navigator` is false (unsupported).
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

// Fresh module per test — the wake-lock module holds module-level ref-count and
// sentinel state that must not leak between tests.
async function freshModule() {
  vi.resetModules();
  return import("@/lib/wake-lock");
}

beforeEach(() => {
  setVisibility("visible");
  installWakeLock();
});

afterEach(() => {
  removeWakeLock();
  vi.restoreAllMocks();
});

describe("wake-lock", () => {
  it("acquires the screen lock on the first holder and releases on the last", async () => {
    const { acquireWakeLock, releaseWakeLock, isWakeLockHeld, wakeLockRefCount } = await freshModule();

    acquireWakeLock();
    await Promise.resolve(); // let the async request() settle
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith("screen");
    expect(isWakeLockHeld()).toBe(true);
    expect(wakeLockRefCount()).toBe(1);

    releaseWakeLock();
    await Promise.resolve();
    expect(isWakeLockHeld()).toBe(false);
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(wakeLockRefCount()).toBe(0);
  });

  it("ref-counts: a batch shares ONE lock, dropped only when the last holder releases", async () => {
    const { acquireWakeLock, releaseWakeLock, isWakeLockHeld, wakeLockRefCount } = await freshModule();

    acquireWakeLock();
    acquireWakeLock();
    acquireWakeLock();
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(1); // only ONE real request for 3 holders
    expect(wakeLockRefCount()).toBe(3);

    releaseWakeLock();
    releaseWakeLock();
    await Promise.resolve();
    expect(isWakeLockHeld()).toBe(true); // still one holder left
    expect(sentinels[0].release).not.toHaveBeenCalled();

    releaseWakeLock();
    await Promise.resolve();
    expect(isWakeLockHeld()).toBe(false);
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("re-acquires when the tab returns to visible if a holder is still active (OS released the lock on hide)", async () => {
    const { acquireWakeLock, isWakeLockHeld } = await freshModule();

    acquireWakeLock();
    await Promise.resolve();
    expect(isWakeLockHeld()).toBe(true);

    // Tab hidden: the OS releases the underlying sentinel.
    sentinels[0].fireOSRelease();
    expect(isWakeLockHeld()).toBe(false);

    // Tab visible again with a holder still active → re-request.
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(isWakeLockHeld()).toBe(true);
  });

  it("does NOT re-acquire on visibility if no holders remain", async () => {
    const { acquireWakeLock, releaseWakeLock } = await freshModule();

    acquireWakeLock();
    await Promise.resolve();
    releaseWakeLock();
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(1); // no new request — nobody wants it
  });

  it("release never drops the ref count below zero", async () => {
    const { releaseWakeLock, wakeLockRefCount } = await freshModule();
    releaseWakeLock();
    releaseWakeLock();
    expect(wakeLockRefCount()).toBe(0);
  });

  it("is a safe no-op when the Wake Lock API is unsupported", async () => {
    removeWakeLock(); // simulate older iOS / Firefox
    const { acquireWakeLock, releaseWakeLock, isWakeLockHeld, wakeLockRefCount } = await freshModule();

    expect(() => acquireWakeLock()).not.toThrow();
    await Promise.resolve();
    expect(isWakeLockHeld()).toBe(false); // nothing acquired, but ref is tracked
    expect(wakeLockRefCount()).toBe(1);
    expect(() => releaseWakeLock()).not.toThrow();
    expect(wakeLockRefCount()).toBe(0);
  });

  it("does not request while the tab is hidden (a request would be rejected)", async () => {
    setVisibility("hidden");
    const { acquireWakeLock, isWakeLockHeld } = await freshModule();

    acquireWakeLock();
    await Promise.resolve();
    expect(requestMock).not.toHaveBeenCalled();
    expect(isWakeLockHeld()).toBe(false);
  });
});
