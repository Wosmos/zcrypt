import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Node's own global localStorage shadows jsdom's and throws without
// --localstorage-file; install a working stub before any import evaluates.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => void backing.set(k, String(v)),
      removeItem: (k: string) => void backing.delete(k),
      clear: () => backing.clear(),
    },
  });
});
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
  prefetchAnalytics,
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
const names = vi.hoisted(() => ({
  map: new Map<string, string>(),
  epoch: 0,
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/file-names", () => ({
  ensureNames: vi.fn(async (cts: Iterable<string | undefined>) => {
    let added = false;
    for (const c of cts) {
      if (c && !names.map.has(c)) {
        names.map.set(c, "decrypted-name");
        added = true;
      }
    }
    if (added) {
      names.epoch++;
      for (const l of names.listeners) l();
    }
  }),
  peekName: (c: string) => names.map.get(c),
  resolveFileNames: vi.fn((files: FileMetadata[]) => files),
  subscribeNames: (cb: () => void) => {
    names.listeners.add(cb);
    return () => names.listeners.delete(cb);
  },
  getNamesEpoch: () => names.epoch,
}));
vi.mock("@/lib/sealed", () => ({ LOCKED: "[locked]" }));
const pass = vi.hoisted(() => ({ cached: "vault-pass" as string | null }));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: (sel: (s: { cachedPassphrase: string | null }) => unknown) =>
    sel({ cachedPassphrase: pass.cached }),
}));

import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsStorageGrowth,
  getAnalyticsFileTypes,
  getDownloadTotal,
  listFiles,
} from "@/lib/api";
import { ensureNames, resolveFileNames } from "@/lib/file-names";
import { getRangeBounds } from "@/components/analytics/date-range";
import { useAnalyticsFiltersStore } from "@/store/analytics-filters";
import { qk } from "@/lib/query-keys";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

// A custom range is deterministic (no "now"); the all-time end is "now" at
// fetch time, so its end is only checked for shape.
const boundedRange: RangeBounds = getRangeBounds("custom", "2026-01-01", "2026-01-30");
const allTimeRange: RangeBounds = getRangeBounds("all", null, null);

beforeEach(() => {
  names.map.clear();
  pass.cached = "vault-pass";
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
      end: expect.any(String),
      allTime: true,
    });
  });

  it("keys by preset + day, so a re-resolved range shares one cached fetch", async () => {
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ file_count: 1 });
    const first = getRangeBounds("30d", null, null);
    const { result } = renderHook(() => useAnalyticsSummary(first), { wrapper });
    await waitFor(() => expect(result.current.summary).toEqual({ file_count: 1 }));
    const again = getRangeBounds("30d", null, null);
    expect(again.key).toBe(first.key);
    const { result: second } = renderHook(() => useAnalyticsSummary(again), { wrapper });
    expect(second.current.summary).toEqual({ file_count: 1 });
    expect(getAnalyticsSummary).toHaveBeenCalledTimes(1);
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
      expect.any(String),
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

function item(over: Partial<AnalyticsFileTypeItem>): AnalyticsFileTypeItem {
  return {
    id: "f1",
    original_name: "",
    encrypted_name: "",
    original_size: 10,
    encrypted_size: 12,
    created_at: "2026-01-05T00:00:00.000Z",
    ...over,
  };
}

describe("useAnalyticsFileTypes", () => {
  it("returns items unchanged when none have an encrypted name", async () => {
    const items = [item({ original_name: "a.png" })];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.items).toEqual(items));
  });

  it("caches the raw ciphertext and resolves names from the shared maps", async () => {
    const items = [item({ encrypted_name: "ENC" })];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([{ ...items[0], original_name: "decrypted-name" }]),
    );
    expect(ensureNames).toHaveBeenCalled();
    const cached = queryClient.getQueryData<AnalyticsFileTypeItem[]>(
      qk.analyticsFileTypes(boundedRange.key),
    );
    expect(cached?.[0].original_name).toBe("");
  });

  it("shows '[locked]' for an encrypted name while the vault is locked", async () => {
    pass.cached = null;
    const items = [item({ encrypted_name: "ENC" })];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([{ ...items[0], original_name: "[locked]" }]),
    );
    expect(ensureNames).not.toHaveBeenCalled();
  });

  it("reads '' for a name still being decrypted", async () => {
    vi.mocked(ensureNames).mockImplementationOnce(async () => {});
    const items = [item({ encrypted_name: "SLOW" })];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].original_name).toBe("");
  });

  it("defaults to an empty array before the query resolves", () => {
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it("leaves items without an encrypted name untouched in a mixed batch", async () => {
    const items = [
      item({ encrypted_name: "ENC" }),
      item({ id: "f2", original_name: "plain.png" }),
    ];
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    const { result } = renderHook(() => useAnalyticsFileTypes(boundedRange), { wrapper });
    await waitFor(() =>
      expect(result.current.items).toEqual([
        { ...items[0], original_name: "decrypted-name" },
        items[1],
      ]),
    );
  });

  it("fetches with no start for an all-time range", async () => {
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderHook(() => useAnalyticsFileTypes(allTimeRange), { wrapper });
    await waitFor(() => expect(getAnalyticsFileTypes).toHaveBeenCalled());
    expect(getAnalyticsFileTypes).toHaveBeenCalledWith({
      start: "",
      end: expect.any(String),
      allTime: true,
    });
  });
});

describe("useRecentUploads", () => {
  it("defaults limit to 8 and returns the resolved file list", async () => {
    const files = [{ id: "1" } as FileMetadata];
    (listFiles as ReturnType<typeof vi.fn>).mockResolvedValue(files);
    const { result } = renderHook(() => useRecentUploads(), { wrapper });
    await waitFor(() => expect(result.current.files).toEqual(files));
    expect(listFiles).toHaveBeenCalledWith(8);
    expect(resolveFileNames).toHaveBeenCalled();
  });

  it("passes a custom limit through to listFiles", async () => {
    (listFiles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderHook(() => useRecentUploads(3), { wrapper });
    await waitFor(() => expect(listFiles).toHaveBeenCalledWith(3));
  });

  it("defaults to an empty array before the query resolves", () => {
    (listFiles as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRecentUploads(), { wrapper });
    expect(result.current.files).toEqual([]);
  });
});

describe("prefetchAnalytics", () => {
  it("warms the selected range and the lifetime panels", async () => {
    useAnalyticsFiltersStore.setState({ preset: "7d", customStart: null, customEnd: null });
    (getAnalyticsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (getAnalyticsTimeseries as ReturnType<typeof vi.fn>).mockResolvedValue({ points: [] });
    (getAnalyticsFileTypes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await prefetchAnalytics();
    expect(getAnalyticsSummary).toHaveBeenCalledTimes(2);
    expect(getAnalyticsTimeseries).toHaveBeenCalledTimes(1);
    expect(getAnalyticsFileTypes).toHaveBeenCalledTimes(2);
    const range = getRangeBounds("7d", null, null);
    expect(queryClient.getQueryData(qk.analyticsSummary(range.key))).toEqual({});
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
