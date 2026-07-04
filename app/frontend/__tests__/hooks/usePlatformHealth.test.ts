import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { PlatformStatus, RepoInfo } from "@/types";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getPlatformStatus, listRepos } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPlatformStatus: vi.fn(),
  listRepos: vi.fn(),
}));

const connected: PlatformStatus[] = [
  { platform: "github", connected: true, username: "wosmo" },
];
const disconnected: PlatformStatus[] = [{ platform: "gitlab", connected: false }];
const repos: RepoInfo[] = [
  {
    id: "r1",
    platform: "github",
    name: "repo1",
    url: "https://github.com/x/repo1",
    used_bytes: 100,
    max_bytes: 1000,
    active: true,
  },
];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePlatformHealth", () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 0 } });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.setDefaultOptions({
      queries: { retry: 1, gcTime: 5 * 60_000, staleTime: 30_000 },
    });
  });

  it("reports loading with empty defaults before the queries resolve", () => {
    (getPlatformStatus as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    (listRepos as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePlatformHealth(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.statuses).toEqual([]);
    expect(result.current.repos).toEqual([]);
    expect(result.current.isAnyConnected).toBe(false);
  });

  it("exposes fetched statuses/repos and detects a connected platform", async () => {
    (getPlatformStatus as ReturnType<typeof vi.fn>).mockResolvedValue(connected);
    (listRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);

    const { result } = renderHook(() => usePlatformHealth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statuses).toEqual(connected);
    expect(result.current.repos).toEqual(repos);
    expect(result.current.isAnyConnected).toBe(true);
  });

  it("isAnyConnected is false when no platform reports connected", async () => {
    (getPlatformStatus as ReturnType<typeof vi.fn>).mockResolvedValue(disconnected);
    (listRepos as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformHealth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAnyConnected).toBe(false);
  });

  it("refresh invalidates both the platforms and repos query keys", async () => {
    (getPlatformStatus as ReturnType<typeof vi.fn>).mockResolvedValue(connected);
    (listRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePlatformHealth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: qk.platforms });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.repos });
  });
});
