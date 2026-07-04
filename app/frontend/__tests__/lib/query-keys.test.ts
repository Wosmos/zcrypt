import { describe, it, expect } from "vitest";
import { qk } from "@/lib/query-keys";

describe("qk", () => {
  it("exposes static keys as fixed tuples", () => {
    expect(qk.files).toEqual(["files"]);
    expect(qk.trash).toEqual(["trash"]);
    expect(qk.quota).toEqual(["quota"]);
    expect(qk.platforms).toEqual(["platforms"]);
    expect(qk.repos).toEqual(["repos"]);
    expect(qk.spaces).toEqual(["spaces"]);
  });

  it("folders() defaults to a null parentId", () => {
    expect(qk.folders()).toEqual(["folders", null]);
  });

  it("folders(id) keys by the given parentId", () => {
    expect(qk.folders("folder-1")).toEqual(["folders", "folder-1"]);
  });

  it("space(id) keys by space id", () => {
    expect(qk.space("space-1")).toEqual(["space", "space-1"]);
  });

  it("shares(fileId) keys by file id", () => {
    expect(qk.shares("file-1")).toEqual(["shares", "file-1"]);
  });

  it("fileMeta(fileId) keys by file id", () => {
    expect(qk.fileMeta("file-1")).toEqual(["file-meta", "file-1"]);
  });

  it("folderShares(folderId) keys by folder id", () => {
    expect(qk.folderShares("folder-1")).toEqual(["folder-shares", "folder-1"]);
  });
});
