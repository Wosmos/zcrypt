/**
 * Screen Wake Lock — keep the display awake while a transfer is running.
 *
 * On mobile, when the screen auto-locks or the device sleeps the browser
 * suspends the tab and aborts in-flight uploads/downloads. Holding a screen
 * wake lock while a transfer is active stops the OS from auto-locking, so a
 * long multi-file upload the user is watching runs to completion instead of
 * dying halfway.
 *
 * Ref-counted: many concurrent transfers share ONE lock; it is released only
 * when the last holder finishes. The OS releases the sentinel whenever the tab
 * becomes hidden, so we re-acquire on `visibilitychange` → visible as long as
 * something still holds a ref.
 *
 * Support: Screen Wake Lock is available on Android Chrome and iOS Safari
 * 16.4+. Where it's missing (older iOS, Firefox) every call is a safe no-op —
 * uploads still work, they just aren't protected from auto-lock. Best-effort by
 * design: a request can also be rejected (tab not visible, low battery), which
 * we swallow.
 */

// navigator.wakeLock is typed non-optional by lib.dom, but is genuinely absent
// at runtime on older iOS / Firefox — access it through this to stay honest.
type MaybeWakeLock = { wakeLock?: WakeLock };

let sentinel: WakeLockSentinel | null = null;
let refCount = 0;
let acquiring = false;
let listenerAttached = false;

function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator &&
    !!(navigator as MaybeWakeLock).wakeLock
  );
}

async function requestLock(): Promise<void> {
  // Already held, mid-request, or nobody wants it anymore — nothing to do.
  if (sentinel || acquiring || refCount === 0 || !supported()) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  acquiring = true;
  try {
    const s = await (navigator as MaybeWakeLock).wakeLock!.request("screen");
    // If everyone released while we were awaiting, drop it immediately.
    if (refCount === 0) {
      await s.release().catch(() => {});
      return;
    }
    sentinel = s;
    // The OS fires 'release' when the tab is hidden; clear our handle so the
    // visibility handler knows to re-acquire on return.
    s.addEventListener("release", () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    // Denied (not visible / battery saver) — best-effort, ignore.
  } finally {
    acquiring = false;
  }
}

function onVisibilityChange(): void {
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    refCount > 0 &&
    !sentinel
  ) {
    void requestLock();
  }
}

function ensureListener(): void {
  if (listenerAttached || typeof document === "undefined") return;
  listenerAttached = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
}

/**
 * Acquire the wake lock (ref-counted). Call when a transfer becomes active.
 * The first holder actually requests the lock; later holders just bump the ref.
 */
export function acquireWakeLock(): void {
  ensureListener();
  refCount++;
  if (refCount === 1) void requestLock();
}

/**
 * Release one ref. When the last holder releases, the underlying lock is
 * dropped so the screen can sleep again. Never drops below zero.
 */
export function releaseWakeLock(): void {
  if (refCount === 0) return;
  refCount--;
  if (refCount === 0 && sentinel) {
    const s = sentinel;
    sentinel = null;
    void s.release().catch(() => {});
  }
}

/** True while the underlying screen lock is actually held (test/diagnostic). */
export function isWakeLockHeld(): boolean {
  return sentinel !== null;
}

/** Current number of active holders (test/diagnostic). */
export function wakeLockRefCount(): number {
  return refCount;
}
