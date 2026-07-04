import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import { useTrashQuery, setTrashData, invalidateTrash } from "@/store/trash";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { listTrash } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listTrash: vi.fn(),
}));

const file1: FileMetadata = {
  id: "f1",
  original_name: "a.txt",
  original_size: 10,
  compressed_size: 8,
  encrypted_size: 12,
  chunk_count: 1,
  sha256: "abc",
  created_at: "2026-01-01T00:00:00Z",
};

const file2: FileMetadata = {
  ...file1,
  id: "f2",
  original_name: "b.txt",
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("store/trash", () => {
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

  describe("useTrashQuery", () => {
    it("fetches via listTrash and exposes the result", async () => {
      (listTrash as ReturnType<typeof vi.fn>).mockResolvedValue([file1]);
      const { result } = renderHook(() => useTrashQuery(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([file1]);
      expect(listTrash).toHaveBeenCalledTimes(1);
    });
  });

  describe("setTrashData", () => {
    it("sets the cache directly when given an array", () => {
      setTrashData([file1]);
      expect(queryClient.getQueryData(qk.trash)).toEqual([file1]);
    });

    it("falls back to an empty array when there is no previous cache and an updater is given", () => {
      setTrashData((prev) => [...prev, file1]);
      expect(queryClient.getQueryData(qk.trash)).toEqual([file1]);
    });

    it("applies an updater function against the previous cache", () => {
      setTrashData([file1]);
      setTrashData((prev) => [...prev, file2]);
      expect(queryClient.getQueryData(qk.trash)).toEqual([file1, file2]);
    });
  });

  describe("invalidateTrash", () => {
    it("invalidates the trash query key", async () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      await expect(invalidateTrash()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith({ queryKey: qk.trash });
    });
  });
});
