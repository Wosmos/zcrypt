import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useConnectivity,
  useConnectionBlocked,
  useFriendlyError,
  isBlockingStatus,
  RECOVERY_FLASH_MS,
} from "@/hooks/useConnectivity";
import { useConnectivityStore } from "@/store/connectivity";

const startStop = vi.hoisted(() => ({ stop: vi.fn(), start: vi.fn() }));

vi.mock("@/store/connectivity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/connectivity")>();
  return {
    ...actual,
    startConnectivity: () => {
      startStop.start();
      return startStop.stop;
    },
  };
});

const initial = useConnectivityStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  startStop.start.mockReset();
  startStop.stop.mockReset();
  useConnectivityStore.setState(initial, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useConnectivity", () => {
  it("starts watching on mount and stops on unmount", () => {
    const { unmount, result } = renderHook(() => useConnectivity());
    expect(startStop.start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ok");
    expect(result.current.known).toBe(false);
    expect(result.current.retryIn).toBeNull();
    unmount();
    expect(startStop.stop).toHaveBeenCalledTimes(1);
  });

  it("counts down to the next retry while the servers are down", () => {
    useConnectivityStore.setState({ backend: "down", nextRetryAt: Date.now() + 10_000 });
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.status).toBe("down");
    expect(result.current.retryIn).toBe(10);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.retryIn).toBe(7);
  });

  it("never shows a negative countdown, or one without a scheduled retry", () => {
    useConnectivityStore.setState({ online: false, nextRetryAt: Date.now() - 5_000 });
    const { result, rerender } = renderHook(() => useConnectivity());
    expect(result.current.retryIn).toBe(0);
    act(() => useConnectivityStore.setState({ nextRetryAt: null }));
    rerender();
    expect(result.current.retryIn).toBeNull();
  });

  it("flashes a recovery for a few seconds, then hides it", () => {
    useConnectivityStore.setState({ backend: "up", recoveredAt: Date.now() });
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.recovering).toBe(true);
    act(() => {
      vi.advanceTimersByTime(RECOVERY_FLASH_MS + 1_000);
    });
    expect(result.current.recovering).toBe(false);
  });
});

describe("useConnectivity ticking", () => {
  it("stops its interval once the recovery flash is over", () => {
    useConnectivityStore.setState({ backend: "up", recoveredAt: Date.now() });
    renderHook(() => useConnectivity());
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(RECOVERY_FLASH_MS + 1_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("blocking", () => {
  it("blocks on offline, down and maintenance only", () => {
    expect(isBlockingStatus("offline")).toBe(true);
    expect(isBlockingStatus("down")).toBe(true);
    expect(isBlockingStatus("maintenance")).toBe(true);
    expect(isBlockingStatus("slow")).toBe(false);
    expect(isBlockingStatus("ok")).toBe(false);
  });

  it("tracks the store", () => {
    const { result } = renderHook(() => useConnectionBlocked());
    expect(result.current).toBe(false);
    act(() => useConnectivityStore.setState({ backend: "down" }));
    expect(result.current).toBe(true);
  });
});

describe("useFriendlyError", () => {
  it("swaps raw network errors for a readable message", () => {
    const { result } = renderHook(() => useFriendlyError());
    expect(result.current(new TypeError("Failed to fetch"), "fallback")).toMatch(/Couldn't reach zcrypt/);
    expect(result.current(new Error("Wrong password"), "fallback")).toBe("Wrong password");
    expect(result.current(new Error(""), "fallback")).toBe("fallback");
    expect(result.current("nope", "fallback")).toBe("fallback");
  });
});
