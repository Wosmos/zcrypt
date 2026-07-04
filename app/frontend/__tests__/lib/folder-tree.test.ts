import { describe, it, expect, vi, beforeEach } from "vitest";

const { listFolders } = vi.hoisted(() => ({ listFolders: vi.fn() }));
vi.mock("@/lib/api", () => ({ listFolders }));

// The real singleton (lib/query-client.ts) defaults to retry: 1, which would
// make the error-path test wait through a real retry delay. Swap in a fresh,
// retry-disabled client scoped to this file only.
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

import { collectSubtreeFolderIds } from "@/lib/folder-tree";
import { queryClient } from "@/lib/query-client";

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe("collectSubtreeFolderIds", () => {
  it("includes the root even when it has no children", async () => {
    listFolders.mockResolvedValue([]);

    const ids = await collectSubtreeFolderIds("root-leaf");

    expect(ids).toEqual(new Set(["root-leaf"]));
    expect(listFolders).toHaveBeenCalledWith("root-leaf");
  });

  it("walks the whole subtree breadth-first across multiple levels", async () => {
    listFolders.mockImplementation(async (id: string) => {
      if (id === "root") return [{ id: "a" }, { id: "b" }];
      if (id === "a") return [{ id: "c" }];
      return [];
    });

    const ids = await collectSubtreeFolderIds("root");

    expect(ids).toEqual(new Set(["root", "a", "b", "c"]));
  });

  it("does not revisit an id it has already collected (cycle-safe)", async () => {
    listFolders.mockImplementation(async (id: string) => {
      if (id === "root") return [{ id: "a" }];
      // "a" points back at "root" — must not be re-added or re-queued.
      if (id === "a") return [{ id: "root" }, { id: "d" }];
      if (id === "d") return [];
      return [];
    });

    const ids = await collectSubtreeFolderIds("root");

    expect(ids).toEqual(new Set(["root", "a", "d"]));
    expect(listFolders).toHaveBeenCalledTimes(3); // root, a, d — never re-fetches root
  });

  it("treats a failed fetch for one branch as empty, without failing the whole walk", async () => {
    listFolders.mockImplementation(async (id: string) => {
      if (id === "root") return [{ id: "x" }, { id: "y" }];
      if (id === "x") throw new Error("network request failed");
      if (id === "y") return [];
      return [];
    });

    const ids = await collectSubtreeFolderIds("root");

    expect(ids).toEqual(new Set(["root", "x", "y"]));
  });
});
