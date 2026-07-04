import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { PlatformStatus, RepoInfo } from "@/types";
import {
  usePlatformStatusQuery,
  useReposQuery,
  getPlatformStatusData,
  getReposData,
  invalidatePlatforms,
  ensurePlatformStatus,
} from "@/store/platform";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getPlatformStatus, listRepos } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPlatformStatus: vi.fn(),
  listRepos: vi.fn(),
}));

const platforms: PlatformStatus[] = [
  { platform: "github", connected: true, username: "wosmo" },
];

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

describe("store/platform", () => {
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

  describe("getPlatformStatusData / getReposData", () => {
    it("returns an empty array when nothing is cached", () => {
      expect(getPlatformStatusData()).toEqual([]);
      expect(getReposData()).toEqual([]);
    });

    it("returns the cached data once present", () => {
      queryClient.setQueryData(qk.platforms, platforms);
      queryClient.setQueryData(qk.repos, repos);
      expect(getPlatformStatusData()).toEqual(platforms);
      expect(getReposData()).toEqual(repos);
    });
  });

  describe("usePlatformStatusQuery", () => {
    it("fetches via getPlatformStatus and exposes the result", async () => {
      (getPlatformStatus as ReturnType<typeof vi.fn>).mockResolvedValue(platforms);
      const { result } = renderHook(() => usePlatformStatusQuery(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(platforms);
      expect(getPlatformStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("useReposQuery", () => {
    it("fetches via listRepos and exposes the result", async () => {
      (listRepos as ReturnType<typeof vi.fn>).mockResolvedValue(repos);
      const { result } = renderHook(() => useReposQuery(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(repos);
      expect(listRepos).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidatePlatforms", () => {
    it("invalidates both the platforms and repos query keys", async () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      await expect(invalidatePlatforms()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith({ queryKey: qk.platforms });
      expect(spy).toHaveBeenCalledWith({ queryKey: qk.repos });
    });
  });

  describe("ensurePlatformStatus", () => {
    it("returns the fetched data on success", async () => {
      (getPlatformStatus as ReturnType<typeof vi.fn>).mockResolvedValue(platforms);
      await expect(ensurePlatformStatus()).resolves.toEqual(platforms);
    });

    it("resolves to an empty array when the fetch fails", async () => {
      (getPlatformStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("network down")
      );
      await expect(ensurePlatformStatus()).resolves.toEqual([]);
    });
  });
});
