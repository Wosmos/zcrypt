import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  listBackupFolders: vi.fn(),
  pickBackupFolder: vi.fn(),
  addBackupFolder: vi.fn(),
  removeBackupFolder: vi.fn(),
  runBackupNow: vi.fn(),
  subscribeBackup: vi.fn(),
}));
const ensureUserKeypair = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const withPassphrase = vi.hoisted(() => vi.fn((fn: (pp: string) => void) => fn("pp")));

vi.mock("@/lib/tauri", () => tauri);
vi.mock("@/lib/keys", () => ({ ensureUserKeypair }));
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("@/components/providers/vault-lock-provider", () => ({
  useVaultLockContext: () => ({ withPassphrase }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { FolderBackup, scanTime } from "@/components/settings/folder-backup";
import { useKeysStore } from "@/store/keys";

const docs = {
  id: "r1",
  path: "/Users/me/Documents",
  name: "Documents",
  files: 12,
  last_scan_at: "2026-11-09 18:00:00",
  available: true,
};

describe("scanTime", () => {
  it("reads SQLite UTC timestamps and rejects empty or bad ones", () => {
    expect(scanTime("2026-11-09 18:00:00")).toBe(Date.UTC(2026, 10, 9, 18, 0, 0));
    expect(scanTime("")).toBeNull();
    expect(scanTime("not a date")).toBeNull();
  });
});

describe("FolderBackup", () => {
  let emit: ((pass: unknown) => void) | null = null;

  beforeEach(() => {
    for (const fn of Object.values(tauri)) fn.mockReset();
    ensureUserKeypair.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    withPassphrase.mockClear();
    tauri.subscribeBackup.mockImplementation(async (cb: (pass: unknown) => void) => {
      emit = cb;
      return () => {};
    });
    useKeysStore.setState({ publicKey: new Uint8Array(32).fill(7), recoveryKit: null });
  });

  afterEach(() => {
    cleanup();
    emit = null;
  });

  it("offers to back up a first folder when none are set up", async () => {
    tauri.listBackupFolders.mockResolvedValue([]);
    render(<FolderBackup />);
    expect(await screen.findByText("addFirst")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "add" })).toBeEnabled());
    expect(screen.queryByText("runNow")).toBeNull();
  });

  it("lists folders with their status and a missing folder", async () => {
    tauri.listBackupFolders.mockResolvedValue([
      docs,
      { ...docs, id: "r2", name: "Gone", available: false },
      { ...docs, id: "r3", name: "New", last_scan_at: "" },
    ]);
    render(<FolderBackup />);
    expect(await screen.findByText("Documents")).toBeInTheDocument();
    expect(screen.getByText(/^status:/)).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  it("adds a picked folder sealed to the account public key", async () => {
    tauri.listBackupFolders.mockResolvedValue([]);
    tauri.pickBackupFolder.mockResolvedValue("/Users/me/Documents");
    tauri.addBackupFolder.mockResolvedValue(docs);
    render(<FolderBackup />);
    const add = await screen.findByRole("button", { name: "add" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await screen.findByText("Documents");
    expect(ensureUserKeypair).toHaveBeenCalledWith("pp");
    expect(tauri.addBackupFolder).toHaveBeenCalledWith(
      "/Users/me/Documents",
      btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("does nothing when the picker is cancelled", async () => {
    tauri.listBackupFolders.mockResolvedValue([]);
    tauri.pickBackupFolder.mockResolvedValue(null);
    render(<FolderBackup />);
    const add = await screen.findByRole("button", { name: "add" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() => expect(tauri.pickBackupFolder).toHaveBeenCalled());
    expect(withPassphrase).not.toHaveBeenCalled();
    expect(add).toBeEnabled();
  });

  it("shows the shell's refusal when a folder can't be added", async () => {
    tauri.listBackupFolders.mockResolvedValue([]);
    tauri.pickBackupFolder.mockResolvedValue("/Users/me");
    tauri.addBackupFolder.mockRejectedValue("This folder is already backed up.");
    render(<FolderBackup />);
    const add = await screen.findByRole("button", { name: "add" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This folder is already backed up."));
  });

  it("refuses to add without an account key", async () => {
    useKeysStore.setState({ publicKey: null });
    tauri.listBackupFolders.mockResolvedValue([]);
    tauri.pickBackupFolder.mockResolvedValue("/Users/me/Documents");
    render(<FolderBackup />);
    const add = await screen.findByRole("button", { name: "add" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("keyUnavailable"));
    expect(tauri.addBackupFolder).not.toHaveBeenCalled();
  });

  it("stops backing up a folder after confirming", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    tauri.removeBackupFolder.mockResolvedValue(undefined);
    render(<FolderBackup />);
    fireEvent.click(await screen.findByRole("button", { name: "remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "removeConfirm" }));
    await waitFor(() => expect(tauri.removeBackupFolder).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByText("Documents")).toBeNull());
  });

  it("starts a pass on demand and reports failures from the backup events", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    tauri.runBackupNow.mockRejectedValueOnce(new Error("engine not connected"));
    render(<FolderBackup />);
    fireEvent.click(await screen.findByRole("button", { name: "runNow" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("engine not connected"));
    tauri.runBackupNow.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "runNow" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("started"));

    await act(async () => {
      emit?.({ id: "r1", uploaded: 0, unchanged: 0, busy: 0, failed: 2, unavailable: false, errors: [] });
    });
    expect(await screen.findByText(/^someFailed:/)).toBeInTheDocument();
  });

  it("points to the recovery kit when backups exist without one", async () => {
    useKeysStore.setState({ recoveryKit: { set: false, createdAt: null } });
    tauri.listBackupFolders.mockResolvedValue([docs]);
    render(<FolderBackup />);
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/settings?tab=privacy");
  });

  it("treats an unreachable shell as no folders", async () => {
    tauri.listBackupFolders.mockRejectedValue(new Error("not signed in"));
    render(<FolderBackup />);
    expect(await screen.findByText("addFirst")).toBeInTheDocument();
  });
});
