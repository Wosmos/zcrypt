import { describe, it, expect, beforeEach, vi } from "vitest";

// A breadth sweep over every request()-based endpoint wrapper in the api client.
// Each wrapper is a thin `return request(path, {method, body})`; the bug class
// that matters is a wrong verb or path, so we pin both for all of them. The
// request() core logic (auth, refresh, retries, errors) is covered separately
// in api-request.test.ts.
const { getState } = vi.hoisted(() => ({ getState: vi.fn(() => ({ accessToken: "t" })) }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: vi.fn() }));

import * as api from "@/lib/api";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  getState.mockReturnValue({ accessToken: "t" });
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "{}",
    json: async () => ({}),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

interface Case {
  name: string;
  run: () => Promise<unknown>;
  path: string;
  method?: string; // undefined => GET
}

const cases: Case[] = [
  // preferences
  { name: "saveDevicePreference", run: () => api.saveDevicePreference({ device_id: "d", color_theme: "c", mode: "dark" }), path: "/api/preferences", method: "PUT" },
  // files + folders
  { name: "listFolders", run: () => api.listFolders(), path: "/api/folders" },
  { name: "createFolder", run: () => api.createFolder({ name: "n" } as never), path: "/api/folders", method: "POST" },
  { name: "renameFolder", run: () => api.renameFolder("fid", "enc"), path: "/api/folders/fid", method: "PATCH" },
  { name: "moveFolder", run: () => api.moveFolder("fid", null), path: "/api/folders/fid/move", method: "PATCH" },
  { name: "deleteFolder", run: () => api.deleteFolder("fid"), path: "/api/folders/fid", method: "DELETE" },
  { name: "moveFile", run: () => api.moveFile("id", "fid"), path: "/api/files/id/move", method: "PATCH" },
  { name: "setFolderPassword", run: () => api.setFolderPassword("fid", "s", "v"), path: "/api/folders/fid/password", method: "POST" },
  { name: "removeFolderPassword", run: () => api.removeFolderPassword("fid"), path: "/api/folders/fid/password", method: "DELETE" },
  { name: "rekeyFile", run: () => api.rekeyFile("id", "s", "c"), path: "/api/files/id/rekey", method: "PUT" },
  { name: "listTrash", run: () => api.listTrash(), path: "/api/files/trash" },
  { name: "restoreFile", run: () => api.restoreFile("id"), path: "/api/files/id/restore", method: "POST" },
  { name: "purgeFile", run: () => api.purgeFile("id"), path: "/api/files/id/purge", method: "DELETE" },
  // platforms + config
  { name: "getPlatformStatus", run: () => api.getPlatformStatus(), path: "/api/platforms/status" },
  { name: "connectPlatform", run: () => api.connectPlatform("github", "tok"), path: "/api/platforms/connect", method: "POST" },
  { name: "telegramProbe", run: () => api.telegramProbe("bt"), path: "/api/platforms/telegram/probe", method: "POST" },
  { name: "disconnectPlatform", run: () => api.disconnectPlatform("github", "u"), path: "/api/platforms/disconnect", method: "DELETE" },
  { name: "toggleTokenScope", run: () => api.toggleTokenScope("tid", true), path: "/api/platforms/tokens/tid/scope", method: "PUT" },
  { name: "listRepos", run: () => api.listRepos(), path: "/api/repos" },
  { name: "updateConfig", run: () => api.updateConfig({ a: 1 }), path: "/api/config", method: "PUT" },
  { name: "getQuota", run: () => api.getQuota(), path: "/api/quota" },
  // admin
  { name: "adminListUsers", run: () => api.adminListUsers(), path: "/api/admin/users" },
  { name: "adminGetStats", run: () => api.adminGetStats(), path: "/api/admin/stats" },
  { name: "adminSetUserRole", run: () => api.adminSetUserRole("u", "admin"), path: "/api/admin/users/u/role", method: "PUT" },
  { name: "adminDeleteUser", run: () => api.adminDeleteUser("u"), path: "/api/admin/users/u", method: "DELETE" },
  { name: "adminListTokens", run: () => api.adminListTokens(), path: "/api/admin/tokens" },
  { name: "adminCreateToken", run: () => api.adminCreateToken({ platform: "github", token: "t", account: "a" } as never), path: "/api/admin/tokens", method: "POST" },
  { name: "adminDeleteToken", run: () => api.adminDeleteToken("tid"), path: "/api/admin/tokens/tid", method: "DELETE" },
  { name: "adminToggleTokenScope", run: () => api.adminToggleTokenScope("tid", false), path: "/api/admin/tokens/tid/scope", method: "PUT" },
  { name: "adminGetDefaultQuota", run: () => api.adminGetDefaultQuota(), path: "/api/admin/quota" },
  { name: "adminSetDefaultQuota", run: () => api.adminSetDefaultQuota(100), path: "/api/admin/quota", method: "PUT" },
  { name: "adminSetUserPlan", run: () => api.adminSetUserPlan("u", "pro"), path: "/api/admin/users/u/plan", method: "PUT" },
  { name: "adminSetUserQuota", run: () => api.adminSetUserQuota("u", 100), path: "/api/admin/users/u/quota", method: "PUT" },
  { name: "adminListFeedback", run: () => api.adminListFeedback(), path: "/api/admin/feedback" },
  { name: "adminGetAuditLog", run: () => api.adminGetAuditLog({}), path: "/api/admin/audit" },
  { name: "adminGetPlans", run: () => api.adminGetPlans(), path: "/api/admin/plans" },
  { name: "adminSetPlans", run: () => api.adminSetPlans({} as never), path: "/api/admin/plans", method: "PUT" },
  { name: "adminGetUser", run: () => api.adminGetUser("u"), path: "/api/admin/users/u" },
  // feedback
  { name: "submitFeedback", run: () => api.submitFeedback({ rating: 5, message: "m", context: "c" }), path: "/api/feedback", method: "POST" },
  { name: "getFeedbackStatus", run: () => api.getFeedbackStatus(), path: "/api/feedback/status" },
  // shares (authenticated management)
  { name: "createShare", run: () => api.createShare({ file_id: "f" } as never), path: "/api/shares", method: "POST" },
  { name: "listShares", run: () => api.listShares(), path: "/api/shares" },
  { name: "revokeShare", run: () => api.revokeShare("sid"), path: "/api/shares/sid", method: "DELETE" },
  // folder shares (authenticated management)
  { name: "createFolderShare", run: () => api.createFolderShare({ name: "n", files: [] }), path: "/api/folder-shares", method: "POST" },
  { name: "listFolderShares", run: () => api.listFolderShares(), path: "/api/folder-shares" },
  { name: "revokeFolderShare", run: () => api.revokeFolderShare("fsid"), path: "/api/folder-shares/fsid", method: "DELETE" },
  // clipboard
  { name: "pushClipboard", run: () => api.pushClipboard({} as never), path: "/api/clipboard", method: "POST" },
  { name: "listClipboard", run: () => api.listClipboard(), path: "/api/clipboard" },
  { name: "deleteClipboardItem", run: () => api.deleteClipboardItem("id"), path: "/api/clipboard/id", method: "DELETE" },
  // sync folders
  { name: "listSyncFolders", run: () => api.listSyncFolders(), path: "/api/sync/folders" },
  { name: "createSyncFolder", run: () => api.createSyncFolder({} as never), path: "/api/sync/folders", method: "POST" },
  { name: "updateSyncFolder", run: () => api.updateSyncFolder("id", { enabled: true }), path: "/api/sync/folders/id", method: "PUT" },
  { name: "deleteSyncFolder", run: () => api.deleteSyncFolder("id"), path: "/api/sync/folders/id", method: "DELETE" },
  // decoy
  { name: "getDecoyStatus", run: () => api.getDecoyStatus(), path: "/api/decoy" },
  { name: "setupDecoy", run: () => api.setupDecoy({ decoy_password: "p" }), path: "/api/decoy/setup", method: "POST" },
  { name: "deleteDecoy", run: () => api.deleteDecoy(), path: "/api/decoy", method: "DELETE" },
  { name: "listDecoyFiles", run: () => api.listDecoyFiles(), path: "/api/decoy/files" },
  { name: "addDecoyFile", run: () => api.addDecoyFile({ name: "n", size: 1 }), path: "/api/decoy/files", method: "POST" },
  { name: "deleteDecoyFile", run: () => api.deleteDecoyFile("id"), path: "/api/decoy/files/id", method: "DELETE" },
  // dead man's switch
  { name: "getDeadManSwitch", run: () => api.getDeadManSwitch(), path: "/api/deadman" },
  { name: "setupDeadManSwitch", run: () => api.setupDeadManSwitch({} as never), path: "/api/deadman", method: "POST" },
  { name: "checkinDeadManSwitch", run: () => api.checkinDeadManSwitch(), path: "/api/deadman/checkin", method: "POST" },
  { name: "deleteDeadManSwitch", run: () => api.deleteDeadManSwitch(), path: "/api/deadman", method: "DELETE" },
  // expiring vaults
  { name: "listExpiringVaults", run: () => api.listExpiringVaults(), path: "/api/vaults" },
  { name: "createExpiringVault", run: () => api.createExpiringVault({} as never), path: "/api/vaults", method: "POST" },
  { name: "getExpiringVault", run: () => api.getExpiringVault("id"), path: "/api/vaults/id" },
  { name: "deleteExpiringVault", run: () => api.deleteExpiringVault("id"), path: "/api/vaults/id", method: "DELETE" },
  // integrity
  { name: "listIntegritySnapshots", run: () => api.listIntegritySnapshots(), path: "/api/integrity" },
  { name: "createIntegritySnapshot", run: () => api.createIntegritySnapshot("f"), path: "/api/integrity", method: "POST" },
  { name: "checkFileIntegrity", run: () => api.checkFileIntegrity("f"), path: "/api/integrity/check", method: "POST" },
  { name: "getChangedFiles", run: () => api.getChangedFiles(), path: "/api/integrity/changes" },
  // vault snapshots
  { name: "listVaultSnapshots", run: () => api.listVaultSnapshots(), path: "/api/snapshots" },
  { name: "createVaultSnapshot", run: () => api.createVaultSnapshot("l"), path: "/api/snapshots", method: "POST" },
  { name: "getVaultSnapshot", run: () => api.getVaultSnapshot("id"), path: "/api/snapshots/id" },
  { name: "deleteVaultSnapshot", run: () => api.deleteVaultSnapshot("id"), path: "/api/snapshots/id", method: "DELETE" },
  // offline pins
  { name: "listOfflinePins", run: () => api.listOfflinePins(), path: "/api/offline" },
  { name: "pinFileOffline", run: () => api.pinFileOffline("f", "d"), path: "/api/offline", method: "POST" },
  { name: "unpinFileOffline", run: () => api.unpinFileOffline("f"), path: "/api/offline/f", method: "DELETE" },
];

describe("api endpoint surface (method + path)", () => {
  it.each(cases)("$name -> $method $path", async (c) => {
    await c.run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    // Compare just the path (+ query), stripping the API_BASE prefix.
    expect(url).toContain(c.path);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe(c.method);
  });
});
