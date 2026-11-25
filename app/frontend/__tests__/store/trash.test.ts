import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import { useTrashQuery, setTrashData, invalidateTrash } from "@/store/trash";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { listTrash } from "@/lib/api";
import { usePassphraseStore } from "@/store/passphrase";

vi.mock("@/lib/api", () => ({
  listTrash: vi.fn(),
}));

const fileNames = vi.hoisted(() => ({
  ensureFileNames: vi.fn(async () => {}),
  resolveFileNames: vi.fn((files: { encrypted_name?: string }[]) =>
    files.map((f) => (f.encrypted_name ? { ...f, original_name: `opened:${f.encrypted_name}` } : f)),
  ),
}));
vi.mock("@/lib/file-names", () => ({
  ...fileNames,
  subscribeNames: () => () => {},
  getNamesEpoch: () => 0,
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

  it("shows a sealed file's opened name, as the vault does", async () => {
    usePassphraseStore.setState({ cachedPassphrase: "pw" });
    const sealed = { ...file1, original_name: "", encrypted_name: "enc1:abc" };
    (listTrash as ReturnType<typeof vi.fn>).mockResolvedValue([sealed]);
    const { result } = renderHook(() => useTrashQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].original_name).toBe("opened:enc1:abc");
    expect(fileNames.ensureFileNames).toHaveBeenCalledWith([sealed]);
    usePassphraseStore.setState({ cachedPassphrase: null });
  });

  it("opens names that were loaded while locked once the vault unlocks", async () => {
    usePassphraseStore.setState({ cachedPassphrase: null });
    const sealed = { ...file1, original_name: "", encrypted_name: "enc1:late" };
    (listTrash as ReturnType<typeof vi.fn>).mockResolvedValue([sealed]);
    const { result } = renderHook(() => useTrashQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fileNames.ensureFileNames).not.toHaveBeenCalled();

    usePassphraseStore.setState({ cachedPassphrase: "pw" });
    await waitFor(() => expect(fileNames.ensureFileNames).toHaveBeenCalledWith([sealed]));
    usePassphraseStore.setState({ cachedPassphrase: null });
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
