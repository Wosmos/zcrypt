import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAdminQuery, fetchAdminOverview } from "@/hooks/useAdminGuardedFetch";
import { adminGetStats, adminListTokens } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { Role } from "@/types";

const auth = vi.hoisted(() => ({ user: null as { role: string } | null }));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: auth.user }),
}));

vi.mock("@/lib/api", () => ({
  adminGetStats: vi.fn(async () => ({ users: 1 })),
  adminListTokens: vi.fn(async () => [{ id: "t" }]),
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAdminQuery", () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    auth.user = null;
  });

  it("stays disabled for a non-admin user", async () => {
    auth.user = { role: Role.User };
    const fetcher = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useAdminQuery(["admin", "t1"], fetcher), { wrapper });
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("stays disabled when logged out", async () => {
    const fetcher = vi.fn().mockResolvedValue(1);
    renderHook(() => useAdminQuery(["admin", "t2"], fetcher), { wrapper });
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches for an admin and serves the cache on a revisit", async () => {
    auth.user = { role: Role.Admin };
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => useAdminQuery(["admin", "t3"], fetcher), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ n: 1 });
    const { result: again } = renderHook(() => useAdminQuery(["admin", "t3"], fetcher), {
      wrapper,
    });
    expect(again.current.data).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("flags an error when the fetcher rejects", async () => {
    auth.user = { role: Role.Admin };
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAdminQuery(["admin", "t4"], fetcher), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("refresh refetches and marks every admin view stale", async () => {
    auth.user = { role: Role.Admin };
    const fetcher = vi.fn().mockResolvedValue(1);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAdminQuery(["admin", "t5"], fetcher), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.refresh());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("can opt out of showing the previous key's data", async () => {
    auth.user = { role: Role.Admin };
    const fetcher = vi.fn(async () => "a");
    const { result, rerender } = renderHook(
      ({ id }) => useAdminQuery(["admin", "user", id], fetcher, { keepPrevious: false }),
      { wrapper, initialProps: { id: "a" } },
    );
    await waitFor(() => expect(result.current.data).toBe("a"));
    fetcher.mockImplementation(() => new Promise(() => {}));
    rerender({ id: "b" });
    expect(result.current.data).toBeUndefined();
  });

  it("fetchAdminOverview loads stats and tokens together", async () => {
    await expect(fetchAdminOverview()).resolves.toEqual({ stats: { users: 1 }, tokens: [{ id: "t" }] });
    expect(adminGetStats).toHaveBeenCalled();
    expect(adminListTokens).toHaveBeenCalled();
  });
});
