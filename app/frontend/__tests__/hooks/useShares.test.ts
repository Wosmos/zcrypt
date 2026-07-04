import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ShareLink } from "@/types";
import {
  useSharesQuery,
  invalidateShares,
  useFileMetaQuery,
} from "@/hooks/useShares";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { listShares, getFileMeta, type FileMetaResponse } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listShares: vi.fn(),
  getFileMeta: vi.fn(),
}));

const shares: ShareLink[] = [
  {
    id: "s1",
    file_id: "f1",
    token: "tok",
    has_password: false,
    expires_at: null,
    max_downloads: 0,
    download_count: 0,
    revoked: false,
    created_at: "now",
  },
];

const fileMeta: FileMetaResponse = {
  id: "f1",
  original_name: "a.txt",
  original_size: 10,
  compressed_size: 8,
  encrypted_size: 9,
  chunk_count: 1,
  sha256: "abc",
  salt: "c2FsdA==",
  status: "done",
  created_at: "now",
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useShares hooks", () => {
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

  describe("useSharesQuery", () => {
    it("fetches a file's share links when enabled with a fileId", async () => {
      (listShares as ReturnType<typeof vi.fn>).mockResolvedValue(shares);
      const { result } = renderHook(() => useSharesQuery("f1", true), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(shares);
      expect(listShares).toHaveBeenCalledWith("f1");
    });

    it("does not fetch when disabled", () => {
      (listShares as ReturnType<typeof vi.fn>).mockResolvedValue(shares);
      const { result } = renderHook(() => useSharesQuery("f1", false), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(listShares).not.toHaveBeenCalled();
    });

    it("does not fetch when the fileId is empty, even if enabled", () => {
      (listShares as ReturnType<typeof vi.fn>).mockResolvedValue(shares);
      const { result } = renderHook(() => useSharesQuery("", true), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(listShares).not.toHaveBeenCalled();
    });
  });

  describe("invalidateShares", () => {
    it("invalidates the shares query key for the given file", async () => {
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      await expect(invalidateShares("f1")).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith({ queryKey: qk.shares("f1") });
    });
  });

  describe("useFileMetaQuery", () => {
    it("fetches a file's server metadata when enabled with a fileId", async () => {
      (getFileMeta as ReturnType<typeof vi.fn>).mockResolvedValue(fileMeta);
      const { result } = renderHook(() => useFileMetaQuery("f1", true), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(fileMeta);
      expect(getFileMeta).toHaveBeenCalledWith("f1");
    });

    it("does not fetch when disabled", () => {
      (getFileMeta as ReturnType<typeof vi.fn>).mockResolvedValue(fileMeta);
      const { result } = renderHook(() => useFileMetaQuery("f1", false), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(getFileMeta).not.toHaveBeenCalled();
    });

    it("does not fetch when the fileId is empty, even if enabled", () => {
      (getFileMeta as ReturnType<typeof vi.fn>).mockResolvedValue(fileMeta);
      const { result } = renderHook(() => useFileMetaQuery("", true), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(getFileMeta).not.toHaveBeenCalled();
    });
  });
});
