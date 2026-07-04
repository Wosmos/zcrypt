import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QuotaInfo } from "@/types";
import { useQuota } from "@/hooks/useQuota";
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

describe("useQuota", () => {
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

  it("returns null before the quota query resolves", () => {
    (getQuota as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useQuota(), { wrapper });
    expect(result.current.quota).toBeNull();
  });

  it("returns the fetched quota once loaded", async () => {
    (getQuota as ReturnType<typeof vi.fn>).mockResolvedValue(quota);
    const { result } = renderHook(() => useQuota(), { wrapper });
    await waitFor(() => expect(result.current.quota).toEqual(quota));
  });

  it("refresh invalidates the quota query key", async () => {
    (getQuota as ReturnType<typeof vi.fn>).mockResolvedValue(quota);
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useQuota(), { wrapper });
    await waitFor(() => expect(result.current.quota).toEqual(quota));

    await act(async () => {
      await result.current.refresh();
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: qk.quota });
  });
});
