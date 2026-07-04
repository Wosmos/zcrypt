import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QuotaInfo } from "@/types";
import { useQuotaQuery, getQuotaData, invalidateQuota } from "@/store/quota";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getQuota } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getQuota: vi.fn(),
}));

const quota: QuotaInfo = {
  used_bytes: 10,
  quota_bytes: 100,
  has_personal_key: false,
  is_unlimited: false,
  plan: "free",
  max_concurrent_uploads: 2,
  max_file_size: 1000,
  can_upload: true,
  allows_byob: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("store/quota", () => {
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

  describe("getQuotaData", () => {
    it("returns null when nothing is cached", () => {
      expect(getQuotaData()).toBeNull();
    });

    it("returns the cached quota once present", () => {
      queryClient.setQueryData(qk.quota, quota);
      expect(getQuotaData()).toEqual(quota);
    });
  });

  describe("useQuotaQuery", () => {
    it("fetches via getQuota and exposes the result", async () => {
      (getQuota as ReturnType<typeof vi.fn>).mockResolvedValue(quota);
      const { result } = renderHook(() => useQuotaQuery(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(quota);
      expect(getQuota).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateQuota", () => {
    it("invalidates the quota query key", async () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      await expect(invalidateQuota()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith({ queryKey: qk.quota });
    });
  });
});
