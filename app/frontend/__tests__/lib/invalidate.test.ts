import { describe, it, expect, vi, afterEach } from "vitest";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { invalidateFilesViews, invalidateFolderViews } from "@/lib/invalidate";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invalidateFilesViews", () => {
  it("invalidates the files, trash, and quota views", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateFilesViews();

    expect(spy).toHaveBeenCalledTimes(3);
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

    expect(spy).toHaveBeenCalledTimes(4);
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
