import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useVaultLock } from "@/hooks/useVaultLock";
import { usePassphraseStore } from "@/store/passphrase";

// The store persists to IndexedDB when "remember on this device" is on; keep
// that entirely mocked so these tests never touch real device storage (same
// convention as __tests__/store/passphrase.test.ts).
vi.mock("@/lib/device-vault", () => ({
  persistPassphrase: vi.fn(async () => {}),
  loadPassphrase: vi.fn(async () => null),
  clearPersistedPassphrase: vi.fn(async () => {}),
}));

describe("useVaultLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePassphraseStore.getState().clear();
    // Deterministic baseline: session (TTL) unlocks, not device-persistent.
    usePassphraseStore.getState().setRememberDevice(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts locked with the modal closed", () => {
    const { result } = renderHook(() => useVaultLock());
    expect(result.current.unlocked).toBe(false);
    expect(result.current.persistent).toBe(false);
    expect(result.current.remainingMinutes).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.modalProps.open).toBe(false);
    expect(result.current.modalProps.error).toBeNull();
    expect(result.current.modalProps.title).toBe("Unlock your vault");
    expect(result.current.modalProps.confirmLabel).toBe("Unlock");
  });

  it("withPassphrase runs the action immediately when already unlocked", () => {
    usePassphraseStore.getState().setPassphrase("secret", 15);
    const { result } = renderHook(() => useVaultLock());
    expect(result.current.unlocked).toBe(true);

    const action = vi.fn();
    act(() => result.current.withPassphrase(action));

    expect(action).toHaveBeenCalledWith("secret");
    expect(result.current.modalProps.open).toBe(false);
  });

  it("withPassphrase opens the modal and queues the action when locked; confirming runs it", () => {
    const { result } = renderHook(() => useVaultLock());
    const action = vi.fn();

    act(() => result.current.withPassphrase(action));
    expect(result.current.modalProps.open).toBe(true);
    expect(action).not.toHaveBeenCalled();

    act(() => result.current.modalProps.onConfirm("mypass"));

    expect(action).toHaveBeenCalledWith("mypass");
    expect(result.current.modalProps.open).toBe(false);
    expect(result.current.unlocked).toBe(true);
  });

  it("unlock() with no callback opens the modal, and confirming does not throw", () => {
    const { result } = renderHook(() => useVaultLock());

    act(() => result.current.unlock());
    expect(result.current.modalProps.open).toBe(true);

    expect(() => act(() => result.current.modalProps.onConfirm("pw"))).not.toThrow();
    expect(result.current.unlocked).toBe(true);
  });

  it("reopen() re-opens the modal with a fresh callback and clears any prior error", () => {
    const { result } = renderHook(() => useVaultLock());
    const first = vi.fn();
    const second = vi.fn();

    act(() => result.current.withPassphrase(first));
    act(() => result.current.setError("Incorrect passphrase."));
    expect(result.current.modalProps.error).toBe("Incorrect passphrase.");

    act(() => result.current.reopen(second));
    expect(result.current.modalProps.open).toBe(true);
    expect(result.current.modalProps.error).toBeNull();

    act(() => result.current.modalProps.onConfirm("pw2"));
    expect(second).toHaveBeenCalledWith("pw2");
    expect(first).not.toHaveBeenCalled();
  });

  it("setError sets the modal's inline error banner", () => {
    const { result } = renderHook(() => useVaultLock());
    act(() => result.current.setError("Incorrect passphrase."));
    expect(result.current.modalProps.error).toBe("Incorrect passphrase.");
  });

  it("onClose dismisses the modal and drops the pending callback", () => {
    const { result } = renderHook(() => useVaultLock());
    const action = vi.fn();

    act(() => result.current.withPassphrase(action));
    act(() => result.current.setError("boom"));
    act(() => result.current.modalProps.onClose());

    expect(result.current.modalProps.open).toBe(false);
    expect(result.current.modalProps.error).toBeNull();

    // A confirm arriving after close must not fire the dropped callback.
    act(() => result.current.modalProps.onConfirm("whatever"));
    expect(action).not.toHaveBeenCalled();
  });

  it("passes the verify guard through to modalProps", () => {
    const verify = vi.fn(async () => true);
    const { result } = renderHook(() => useVaultLock({ verify }));
    expect(result.current.modalProps.verify).toBe(verify);
  });

  it("wrong-passphrase retry: setError keeps the same pending action queued for a fresh confirm", () => {
    const { result } = renderHook(() => useVaultLock());
    const action = vi.fn();

    act(() => result.current.withPassphrase(action));
    act(() => result.current.setError("Incorrect passphrase."));
    expect(result.current.modalProps.error).toBe("Incorrect passphrase.");
    expect(action).not.toHaveBeenCalled();

    act(() => result.current.modalProps.onConfirm("correct-pass"));

    expect(action).toHaveBeenCalledWith("correct-pass");
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.modalProps.error).toBeNull();
    expect(result.current.unlocked).toBe(true);
  });

  it("lock() clears the cache, closes the modal, and drops any pending action/error", () => {
    usePassphraseStore.getState().setPassphrase("secret", 15);
    const { result } = renderHook(() => useVaultLock());
    expect(result.current.unlocked).toBe(true);

    const action = vi.fn();
    act(() => result.current.unlock(action));
    act(() => result.current.setError("boom"));

    act(() => result.current.lock());

    expect(result.current.unlocked).toBe(false);
    expect(result.current.modalProps.open).toBe(false);
    expect(result.current.modalProps.error).toBeNull();

    act(() => result.current.modalProps.onConfirm("anything"));
    expect(action).not.toHaveBeenCalled();
  });

  it("reflects a persistent (remembered on this device) unlock with no countdown", () => {
    usePassphraseStore.getState().setRememberDevice(true);
    usePassphraseStore.getState().setPassphrase("pw", 15);

    const { result } = renderHook(() => useVaultLock());
    expect(result.current.unlocked).toBe(true);
    expect(result.current.persistent).toBe(true);
    expect(result.current.remainingMinutes).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
  });

  it("counts down remainingMinutes/remainingSeconds during a session unlock, then expires", () => {
    usePassphraseStore.getState().setPassphrase("pw", 5);
    const { result } = renderHook(() => useVaultLock());

    expect(result.current.unlocked).toBe(true);
    expect(result.current.remainingMinutes).toBe(5);
    expect(result.current.remainingSeconds).toBe(300);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current.remainingSeconds).toBe(239);
    expect(result.current.remainingMinutes).toBe(4);

    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(result.current.unlocked).toBe(false);
    expect(result.current.remainingMinutes).toBe(0);
    expect(result.current.remainingSeconds).toBe(0);
  });

  it("skips the tick interval for a cache window that already expired before mount", () => {
    usePassphraseStore.setState({
      cachedPassphrase: "stale",
      cacheUntil: Date.now() - 1_000,
      persistent: false,
    });

    const { result } = renderHook(() => useVaultLock());
    expect(result.current.unlocked).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.remainingMinutes).toBe(0);
  });
});
