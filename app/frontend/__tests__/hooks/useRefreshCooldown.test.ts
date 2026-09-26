import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRefreshCooldown } from "@/hooks/useRefreshCooldown";

describe("useRefreshCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts able to refresh, idle, with no remaining cooldown", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshCooldown(fn));

    expect(result.current.canRefresh).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it("trigger runs fn once and starts a 5-minute cooldown", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshCooldown(fn));

    await act(async () => {
      await result.current.trigger();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.canRefresh).toBe(false);
    expect(result.current.remainingMs).toBe(5 * 60_000);
  });

  it("trigger is a no-op while the cooldown is still active", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshCooldown(fn));

    await act(async () => {
      await result.current.trigger();
    });
    await act(async () => {
      await result.current.trigger();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("counts remainingMs down every second", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshCooldown(fn));

    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.remainingMs).toBe(5 * 60_000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.remainingMs).toBe(5 * 60_000 - 1000);
  });

  it("becomes refreshable again once the cooldown fully elapses, allowing a second trigger", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshCooldown(fn));

    await act(async () => {
      await result.current.trigger();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(result.current.remainingMs).toBe(0);
    expect(result.current.canRefresh).toBe(true);

    await act(async () => {
      await result.current.trigger();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears busy even when fn rejects, without starting a cooldown", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useRefreshCooldown(fn));

    await act(async () => {
      await expect(result.current.trigger()).rejects.toThrow("boom");
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.canRefresh).toBe(true);
  });
});
