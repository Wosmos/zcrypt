import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { useAdminGuardedFetch } from "@/hooks/useAdminGuardedFetch";
import { useAuthStore } from "@/store/auth";
import { Role } from "@/types";

vi.mock("@/store/auth", () => ({
  useAuthStore: vi.fn(),
}));

const authMock = vi.mocked(useAuthStore);

function asAdmin() {
  authMock.mockReturnValue({ user: { role: Role.Admin } } as unknown as ReturnType<
    typeof useAuthStore
  >);
}
function asUser() {
  authMock.mockReturnValue({ user: { role: Role.User } } as unknown as ReturnType<
    typeof useAuthStore
  >);
}
function loggedOut() {
  authMock.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuthStore>);
}

describe("useAdminGuardedFetch", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("does not run the fetcher for a non-admin user", async () => {
    asUser();
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAdminGuardedFetch(fetcher));
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("does not run the fetcher when logged out", async () => {
    loggedOut();
    const fetcher = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAdminGuardedFetch(fetcher));
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("runs the fetcher on mount for an admin and clears loading", async () => {
    asAdmin();
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAdminGuardedFetch(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(false);
    expect(result.current.user).toEqual({ role: Role.Admin });
  });

  it("sets error when the fetcher rejects", async () => {
    asAdmin();
    const fetcher = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useAdminGuardedFetch(fetcher));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("exposes refresh() that re-runs the fetcher and resets error", async () => {
    asAdmin();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("first")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAdminGuardedFetch(fetcher));

    await waitFor(() => expect(result.current.error).toBe(true));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
