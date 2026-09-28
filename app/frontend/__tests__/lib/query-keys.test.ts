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

  it("analyticsSummary(start, end) keys by the resolved window", () => {
    expect(qk.analyticsSummary("2026-01-01", "2026-01-31")).toEqual([
      "analytics",
      "summary",
      "2026-01-01",
      "2026-01-31",
    ]);
  });

  it("analyticsTimeseries(start, end, bucket) keys by window and bucket", () => {
    expect(qk.analyticsTimeseries("2026-01-01", "2026-01-31", "day")).toEqual([
      "analytics",
      "timeseries",
      "2026-01-01",
      "2026-01-31",
      "day",
    ]);
  });

  it("analyticsFileTypes(start, end) keys by the resolved window", () => {
    expect(qk.analyticsFileTypes("2026-01-01", "2026-01-31")).toEqual([
      "analytics",
      "file-types",
      "2026-01-01",
      "2026-01-31",
    ]);
  });

  it("exposes analyticsStorageGrowth as a fixed tuple", () => {
    expect(qk.analyticsStorageGrowth).toEqual(["analytics", "storage-growth"]);
  });

  it("recentUploads(limit) keys by limit", () => {
    expect(qk.recentUploads(8)).toEqual(["analytics", "recent", 8]);
  });
});
