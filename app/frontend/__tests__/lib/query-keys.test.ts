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

  it("analytics keys use the range's stable key, never millisecond bounds", () => {
    expect(qk.analyticsSummary("30d:2026-1-5")).toEqual(["analytics", "summary", "30d:2026-1-5"]);
    expect(qk.analyticsTimeseries("30d:2026-1-5", "day")).toEqual([
      "analytics",
      "timeseries",
      "30d:2026-1-5",
      "day",
    ]);
    expect(qk.analyticsFileTypes("all:2026-1-5")).toEqual(["analytics", "file-types", "all:2026-1-5"]);
  });

  it("exposes analyticsStorageGrowth as a fixed tuple", () => {
    expect(qk.analyticsStorageGrowth).toEqual(["analytics", "storage-growth"]);
  });

  it("recentUploads(limit) keys by limit", () => {
    expect(qk.recentUploads(8)).toEqual(["analytics", "recent", 8]);
  });

  it("admin keys share one root; settings/tools keys stay out of the persisted roots", () => {
    expect(qk.adminOverview[0]).toBe("admin");
    expect(qk.adminUsers).toEqual(["admin", "users"]);
    expect(qk.adminUser("u1")).toEqual(["admin", "user", "u1"]);
    expect(qk.adminAudit(2, "login")).toEqual(["admin", "audit", 2, "login"]);
    expect(qk.adminDownloads("30")).toEqual(["admin", "downloads", "30"]);
    expect(qk.adminFeedback(20)).toEqual(["admin", "feedback", 20]);
    expect(qk.adminBugReports("open", 20)).toEqual(["admin", "bug-reports", "open", 20]);
    expect(qk.adminReviews("pending", 20)).toEqual(["admin", "reviews", "pending", 20]);
    expect(qk.myReview).toEqual(["review", "mine"]);
    expect(qk.adminPlans).toEqual(["admin", "plans"]);
    expect(qk.devices("d1")).toEqual(["tools", "devices", "d1"]);
    for (const k of [qk.syncFolders, qk.expiring, qk.integrity, qk.snapshots]) expect(k[0]).toBe("tools");
    for (const k of [qk.securityActivity, qk.linkedAccounts, qk.sessions, qk.deadman, qk.decoy])
      expect(k[0]).toBe("settings");
    expect(qk.incompleteUploads).toEqual(["uploads", "incomplete"]);
  });
});
