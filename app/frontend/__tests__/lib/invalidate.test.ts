import { describe, it, expect, vi, afterEach } from "vitest";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { invalidateFilesViews, invalidateFolderViews, applyFileEvents } from "@/lib/invalidate";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invalidateFilesViews", () => {
  it("invalidates the files, trash, and quota views and marks analytics stale", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateFilesViews();

    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["analytics"], refetchType: "none" });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.files });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.trash });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.quota });
  });

  it("resolves to undefined", async () => {
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await expect(invalidateFilesViews()).resolves.toBeUndefined();
  });
});

describe("invalidateFolderViews", () => {
  it("invalidates folders plus every file view (cascade on folder delete)", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateFolderViews();

    expect(spy).toHaveBeenCalledTimes(5);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["folders"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.files });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.trash });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.quota });
  });

  it("resolves to undefined", async () => {
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await expect(invalidateFolderViews()).resolves.toBeUndefined();
  });
});

describe("applyFileEvents", () => {
  const ev = (op: string, id: string) => ({ op, file_id: id, rev: 1 }) as never;

  it("patches deleted rows out of the cached list and refetches only trash + quota", async () => {
    queryClient.setQueryData(qk.files, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await expect(applyFileEvents([ev("deleted", "a"), ev("deleted", "c")])).resolves.toBeUndefined();
    expect(queryClient.getQueryData(qk.files)).toEqual([{ id: "b" }]);
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.trash });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.quota });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["analytics"], refetchType: "none" });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: qk.files });
  });

  it("leaves an unloaded list alone on a delete", async () => {
    queryClient.removeQueries({ queryKey: qk.files });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await applyFileEvents([ev("deleted", "a")]);
    expect(queryClient.getQueryData(qk.files)).toBeUndefined();
  });

  it("falls back to the full invalidation for any non-delete, unreadable, or empty batch", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    await applyFileEvents([ev("deleted", "a"), ev("added", "b")]);
    await applyFileEvents([null]);
    await applyFileEvents([]);
    expect(spy.mock.calls.filter((c) => c[0]?.queryKey === qk.files)).toHaveLength(3);
  });
});
