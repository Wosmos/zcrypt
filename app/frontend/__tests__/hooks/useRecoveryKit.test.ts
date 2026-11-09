import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const { getMyKey } = vi.hoisted(() => ({ getMyKey: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), getMyKey }));

import { useRecoveryKit } from "@/hooks/useRecoveryKit";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";

beforeEach(() => {
  getMyKey.mockReset();
  useKeysStore.setState({ recoveryKit: null });
  useAuthStore.setState({ accessToken: "token" });
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ accessToken: null });
});

describe("useRecoveryKit", () => {
  it("reads the kit status from the key record once signed in", async () => {
    getMyKey.mockResolvedValue({ recovery_kit_set: true, recovery_kit_created_at: "2026-11-09T10:00:00Z" });
    const { result } = renderHook(() => useRecoveryKit());
    await waitFor(() => expect(result.current.status).toEqual({ set: true, createdAt: "2026-11-09T10:00:00Z" }));
  });

  it("treats a missing record or flag as no kit, and ignores errors", async () => {
    getMyKey.mockResolvedValueOnce({});
    const { result } = renderHook(() => useRecoveryKit());
    await waitFor(() => expect(result.current.status).toEqual({ set: false, createdAt: null }));

    useKeysStore.setState({ recoveryKit: null });
    getMyKey.mockResolvedValueOnce(null);
    renderHook(() => useRecoveryKit());
    getMyKey.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useRecoveryKit());
    await waitFor(() => expect(getMyKey).toHaveBeenCalledTimes(3));
    expect(useKeysStore.getState().recoveryKit).toBeNull();
  });

  it("doesn't fetch when signed out or already known, and drops a late answer", async () => {
    useAuthStore.setState({ accessToken: null });
    renderHook(() => useRecoveryKit());
    expect(getMyKey).not.toHaveBeenCalled();

    useAuthStore.setState({ accessToken: "token" });
    useKeysStore.setState({ recoveryKit: { set: true, createdAt: "x" } });
    renderHook(() => useRecoveryKit());
    expect(getMyKey).not.toHaveBeenCalled();

    useKeysStore.setState({ recoveryKit: null });
    let answer: (v: unknown) => void = () => {};
    getMyKey.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const { unmount } = renderHook(() => useRecoveryKit());
    unmount();
    answer({ recovery_kit_set: true });
    await Promise.resolve();
    expect(useKeysStore.getState().recoveryKit).toBeNull();

    getMyKey.mockReturnValueOnce(new Promise((r) => (answer = r)));
    renderHook(() => useRecoveryKit());
    useKeysStore.setState({ recoveryKit: { set: false, createdAt: null } });
    answer({ recovery_kit_set: true });
    await Promise.resolve();
    expect(useKeysStore.getState().recoveryKit).toEqual({ set: false, createdAt: null });
  });

  it("marks the kit saved or removed", () => {
    useKeysStore.setState({ recoveryKit: { set: false, createdAt: null } });
    const { result } = renderHook(() => useRecoveryKit());
    act(() => result.current.markSet("2026-11-09"));
    expect(useKeysStore.getState().recoveryKit).toEqual({ set: true, createdAt: "2026-11-09" });
    act(() => result.current.markRemoved());
    expect(useKeysStore.getState().recoveryKit).toEqual({ set: false, createdAt: null });
  });
});
