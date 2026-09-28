import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  useAnalyticsSummary,
  useAnalyticsTimeseries,
  useStorageGrowth,
  useAnalyticsFileTypes,
  useRecentUploads,
  useAppDownloadsTotal,
  useRefreshAnalytics,
  anyLoading,
} from "@/hooks/useAnalytics";
import { queryClient } from "@/lib/query-client";
import type { RangeBounds } from "@/components/analytics/date-range";
import type { AnalyticsFileTypeItem } from "@/lib/api";
import type { FileMetadata } from "@/types";

vi.mock("@/lib/api", () => ({
  getAnalyticsSummary: vi.fn(),
  getAnalyticsTimeseries: vi.fn(),
  getAnalyticsStorageGrowth: vi.fn(),
  getAnalyticsFileTypes: vi.fn(),
  getDownloadTotal: vi.fn(),
  listFiles: vi.fn(),
}));
vi.mock("@/lib/file-names", () => ({
  decryptFileNames: vi.fn(async (files: FileMetadata[]) => files),
}));
vi.mock("@/lib/sealed", () => ({
  userNameKey: vi.fn(async () => null),
}));
vi.mock("@/lib/name-crypto", () => ({
  decryptNameSafe: vi.fn(async () => "decrypted-name"),
}));

import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsStorageGrowth,
  getAnalyticsFileTypes,
  getDownloadTotal,
  listFiles,
} from "@/lib/api";
import { decryptFileNames } from "@/lib/file-names";
import { userNameKey } from "@/lib/sealed";
import { decryptNameSafe } from "@/lib/name-crypto";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const boundedRange: RangeBounds = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2026-01-31T00:00:00.000Z"),
  allTime: false,
  label: "30d",
  bucket: "day",
};

const allTimeRange: RangeBounds = {
  start: null,
  end: new Date("2026-01-31T00:00:00.000Z"),
  allTime: true,
  label: "All time",
  bucket: "month",
};

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

describe("useAnalyticsSummary", () => {
  it("returns null before the query resolves", () => {
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalyticsSummary(boundedRange), { wrapper });
    expect(result.current.summary).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("fetches with the resolved start/end for a bounded range", async () => {
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ file_count: 3 });
    const { result } = renderHook(() => useAnalyticsSummary(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.summary).toEqual({ file_count: 3 }));
    expect(getAnalyticsSummary).toHaveBeenCalledWith({
      start: boundedRange.start!.toISOString(),
      end: boundedRange.end.toISOString(),
      allTime: false,
    });
  });

  it("fetches with allTime true and no start for an all-time range", async () => {
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ file_count: 9 });
    const { result } = renderHook(() => useAnalyticsSummary(allTimeRange), { wrapper });
    await waitFor(() => expect(result.current.summary).toEqual({ file_count: 9 }));
    expect(getAnalyticsSummary).toHaveBeenCalledWith({
      start: "",
      end: allTimeRange.end.toISOString(),
      allTime: true,
    });
  });

  it("surfaces a query error", async () => {
    const err = new Error("summary failed");
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const { result } = renderHook(() => useAnalyticsSummary(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(err));
  });
});

describe("useAnalyticsTimeseries", () => {
  it("returns null before the query resolves", () => {
    (getAnalyticsTimeseries as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalyticsTimeseries(boundedRange), { wrapper });
    expect(result.current.data).toBeNull();
  });

  it("fetches with the range's start/end/bucket", async () => {
    (getAnalyticsTimeseries as ReturnType<typeof vi.fn>).mockResolvedValue({
      bucket: "day",
      points: [],
    });
    const { result } = renderHook(() => useAnalyticsTimeseries(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ bucket: "day", points: [] }));
    expect(getAnalyticsTimeseries).toHaveBeenCalledWith(
      boundedRange.start!.toISOString(),
      boundedRange.end.toISOString(),
      "day",
    );
  });

  it("widens the window to the epoch for an all-time range", async () => {
    (getAnalyticsTimeseries as ReturnType<typeof vi.fn>).mockResolvedValue({
      bucket: "month",
      points: [],
    });
    renderHook(() => useAnalyticsTimeseries(allTimeRange), { wrapper });
    await waitFor(() => expect(getAnalyticsTimeseries).toHaveBeenCalled());
    expect(getAnalyticsTimeseries).toHaveBeenCalledWith(
      new Date(0).toISOString(),
      allTimeRange.end.toISOString(),
      "month",
    );
  });
});

describe("useStorageGrowth", () => {
  it("defaults to an empty array before the query resolves", () => {
    (getAnalyticsStorageGrowth as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useStorageGrowth(), { wrapper });
    expect(result.current.points).toEqual([]);
  });

  it("returns the fetched growth points", async () => {
    const points = [{ bucket: "2026-01", cumulative_bytes: 100 }];
    (getAnalyticsStorageGrowth as ReturnType<typeof vi.fn>).mockResolvedValue(points);
    const { result } = renderHook(() => useStorageGrowth(), { wrapper });
    await waitFor(() => expect(result.current.points).toEqual(points));
  });
});

describe("useAnalyticsFileTypes", () => {
  it("returns items unchanged when none have an encrypted name", async () => {
    const items: AnalyticsFileTypeItem[] = [
      {
        id: "f1",
        original_name: "a.png",
        encrypted_name: "",
        original_size: 10,
        encrypted_size: 12,
        created_at: "2026-01-05T00:00:00.000Z",
      },
    ];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.items).toEqual(items));
    expect(userNameKey).not.toHaveBeenCalled();
  });

  it("decrypts encrypted names when the name key is available", async () => {
    const items: AnalyticsFileTypeItem[] = [
      {
        id: "f1",
        original_name: "",
        encrypted_name: "ENC",
        original_size: 10,
        encrypted_size: 12,
        created_at: "2026-01-05T00:00:00.000Z",
      },
    ];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    (userNameKey as ReturnType<typeof vi.fn>).mockResolvedValue({} as CryptoKey);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([{ ...items[0], original_name: "decrypted-name" }]),
    );
    expect(decryptNameSafe).toHaveBeenCalledWith("ENC", {});
  });

  it("falls back to '[locked]' for an encrypted name with no key available", async () => {
    const items: AnalyticsFileTypeItem[] = [
      {
        id: "f1",
        original_name: "",
        encrypted_name: "ENC",
        original_size: 10,
        encrypted_size: 12,
        created_at: "2026-01-05T00:00:00.000Z",
      },
    ];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    (userNameKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([{ ...items[0], original_name: "[locked]" }]),
    );
  });

  it("defaults to an empty array before the query resolves", () => {
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it("leaves items without an encrypted name untouched in a mixed batch", async () => {
    const items: AnalyticsFileTypeItem[] = [
      {
        id: "f1",
        original_name: "",
        encrypted_name: "ENC",
        original_size: 10,
        encrypted_size: 12,
        created_at: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "f2",
        original_name: "plain.png",
        encrypted_name: "",
        original_size: 20,
        encrypted_size: 22,
        created_at: "2026-01-06T00:00:00.000Z",
      },
    ];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    (userNameKey as ReturnType<typeof vi.fn>).mockResolvedValue({} as CryptoKey);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([
        { ...items[0], original_name: "decrypted-name" },
        items[1],
      ]),
    );
  });

  it("fetches with an epoch-anchored 'all' key for an all-time range", async () => {
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderHook(() => useAnalyticsFileTypes(allTimeRange), { wrapper });
    await waitFor(() => expect(getAnalyticsFileTypes).toHaveBeenCalled());
    expect(getAnalyticsFileTypes).toHaveBeenCalledWith({ start: "", end: allTimeRange.end.toISOString(), allTime: true });
  });
});

describe("useRecentUploads", () => {
  it("defaults limit to 8 and returns the decrypted file list", async () => {
    const files = [{ id: "1" } as FileMetadata];
    (listFiles as ReturnType<typeof vi.fn>).mockResolvedValue(files);
    (decryptFileNames as ReturnType<typeof vi.fn>).mockResolvedValue(files);
    const { result } = renderHook(() => useRecentUploads(), { wrapper });
    await waitFor(() => expect(result.current.files).toEqual(files));
    expect(listFiles).toHaveBeenCalledWith(undefined, 8);
  });

  it("passes a custom limit through to listFiles", async () => {
    (listFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (decryptFileNames as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderHook(() => useRecentUploads(3), { wrapper });
    await waitFor(() => expect(listFiles).toHaveBeenCalledWith(undefined, 3));
  });

  it("defaults to an empty array before the query resolves", () => {
    (listFiles as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRecentUploads(), { wrapper });
    expect(result.current.files).toEqual([]);
  });
});

describe("useAppDownloadsTotal", () => {
  it("returns null before the query resolves", () => {
    (getDownloadTotal as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAppDownloadsTotal(), { wrapper });
    expect(result.current).toBeNull();
  });

  it("returns the fetched total once loaded", async () => {
    (getDownloadTotal as ReturnType<typeof vi.fn>).mockResolvedValue(42);
    const { result } = renderHook(() => useAppDownloadsTotal(), { wrapper });
    await waitFor(() => expect(result.current).toBe(42));
  });

  it("does not retry on failure", async () => {
    (getDownloadTotal as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
    renderHook(() => useAppDownloadsTotal(), { wrapper });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(["analytics", "app-downloads-total"])?.status,
      ).toBe("error"),
    );
    expect(getDownloadTotal).toHaveBeenCalledTimes(1);
  });
});

describe("useRefreshAnalytics", () => {
  it("invalidates every analytics query key at once", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRefreshAnalytics(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["analytics"] });
  });
});

describe("anyLoading", () => {
  it("is false when given no flags", () => {
    expect(anyLoading()).toBe(false);
  });

  it("is false when every flag is false", () => {
    expect(anyLoading(false, false)).toBe(false);
  });

  it("is true when at least one flag is true", () => {
    expect(anyLoading(false, true, false)).toBe(true);
  });
});
