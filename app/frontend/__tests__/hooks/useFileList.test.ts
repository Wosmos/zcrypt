import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFileList } from "@/hooks/useFileList";
import type { FileMetadata } from "@/types";

const { useFilesQuery, setFilesData, invalidateFiles, hydrateFilesFromCache } = vi.hoisted(() => ({
  useFilesQuery: vi.fn(),
  setFilesData: vi.fn(),
  invalidateFiles: vi.fn(async () => {}),
  hydrateFilesFromCache: vi.fn(async () => {}),
}));
vi.mock("@/store/files", () => ({
  useFilesQuery,
  setFilesData,
  invalidateFiles,
  hydrateFilesFromCache,
}));

function file(id: string): FileMetadata {
  return {
    id,
    original_name: `${id}.txt`,
    original_size: 10,
    compressed_size: 8,
    encrypted_size: 9,
    chunk_count: 1,
    sha256: "abc",
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("useFileList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilesQuery.mockReturnValue({ data: undefined, isPending: false, error: null });
  });

  it("seeds from the OPFS cache on mount", () => {
    renderHook(() => useFileList());
    expect(hydrateFilesFromCache).toHaveBeenCalledTimes(1);
  });

  it("defaults files to an empty array when the query has no data yet", () => {
    const { result } = renderHook(() => useFileList());
    expect(result.current.files).toEqual([]);
  });

  it("returns the query's file data", () => {
    const data = [file("a"), file("b")];
    useFilesQuery.mockReturnValue({ data, isPending: false, error: null });
    const { result } = renderHook(() => useFileList());
    expect(result.current.files).toBe(data);
  });

  it("is loading only when pending AND there is no data yet", () => {
    useFilesQuery.mockReturnValue({ data: undefined, isPending: true, error: null });
    const { result: pendingEmpty } = renderHook(() => useFileList());
    expect(pendingEmpty.current.loading).toBe(true);

    useFilesQuery.mockReturnValue({ data: [file("a")], isPending: true, error: null });
    const { result: pendingWithData } = renderHook(() => useFileList());
    expect(pendingWithData.current.loading).toBe(false);

    useFilesQuery.mockReturnValue({ data: undefined, isPending: false, error: null });
    const { result: idleEmpty } = renderHook(() => useFileList());
    expect(idleEmpty.current.loading).toBe(false);
  });

  it("surfaces an Error instance's message", () => {
    useFilesQuery.mockReturnValue({ data: undefined, isPending: false, error: new Error("boom") });
    const { result } = renderHook(() => useFileList());
    expect(result.current.error).toBe("boom");
  });

  it("returns null error when there is no error", () => {
    const { result } = renderHook(() => useFileList());
    expect(result.current.error).toBeNull();
  });

  it("returns null error for a non-Error error value", () => {
    useFilesQuery.mockReturnValue({ data: undefined, isPending: false, error: "not-an-error-instance" });
    const { result } = renderHook(() => useFileList());
    expect(result.current.error).toBeNull();
  });

  it("refresh invalidates the files query regardless of the (ignored) filter arg", async () => {
    const { result } = renderHook(() => useFileList());
    await act(async () => {
      await result.current.refresh("trash");
    });
    expect(invalidateFiles).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(invalidateFiles).toHaveBeenCalledTimes(2);
  });

  it("setFiles forwards an array straight through to setFilesData", () => {
    const { result } = renderHook(() => useFileList());
    const next = [file("z")];
    act(() => result.current.setFiles(next));
    expect(setFilesData).toHaveBeenCalledWith(next);
  });

  it("setFiles forwards an updater function straight through to setFilesData", () => {
    const { result } = renderHook(() => useFileList());
    const updater = (prev: FileMetadata[]) => prev;
    act(() => result.current.setFiles(updater));
    expect(setFilesData).toHaveBeenCalledWith(updater);
  });
});
