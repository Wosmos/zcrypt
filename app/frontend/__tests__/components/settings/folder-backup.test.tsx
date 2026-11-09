import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  listBackupFolders: vi.fn(),
  pickBackupFolder: vi.fn(),
  addBackupFolder: vi.fn(),
  removeBackupFolder: vi.fn(),
  runBackupNow: vi.fn(),
  subscribeBackup: vi.fn(),
  getBackupSchedule: vi.fn(),
  setBackupSchedule: vi.fn(),
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
  useLocale: () => "en-GB",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { clockTime, FolderBackup, scanTime } from "@/components/settings/folder-backup";
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

describe("clockTime", () => {
  it("writes a time of day the locale's way and leaves junk alone", () => {
    expect(clockTime("02:00", "en-GB")).toMatch(/^0?2:00$/);
    expect(clockTime("23:30", "en-US")).toMatch(/11:30\sPM/);
    expect(clockTime("later", "en-GB")).toBe("later");
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
    tauri.getBackupSchedule.mockResolvedValue({ mode: "instant", time: "02:00" });
    tauri.setBackupSchedule.mockResolvedValue(undefined);
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

  it("switches to a nightly backup, changes its time and says when it runs", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    render(<FolderBackup />);
    const mode = await screen.findByRole("combobox", { name: "scheduleTitle" });
    expect(screen.getByText("scheduleInstantDesc")).toBeInTheDocument();
    expect(screen.queryByLabelText("scheduleTime")).toBeNull();

    fireEvent.change(mode, { target: { value: "nightly" } });
    await waitFor(() =>
      expect(tauri.setBackupSchedule).toHaveBeenCalledWith({ mode: "nightly", time: "02:00" }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      `scheduleNightlySaved:${JSON.stringify({ time: clockTime("02:00", "en-GB") })}`,
    );

    const time = screen.getByLabelText("scheduleTime");
    fireEvent.change(time, { target: { value: "23:15" } });
    await waitFor(() =>
      expect(tauri.setBackupSchedule).toHaveBeenLastCalledWith({ mode: "nightly", time: "23:15" }),
    );
    expect(screen.getByText(
        `scheduleNightlyDesc:${JSON.stringify({ time: clockTime("23:15", "en-GB") })}`,
      ),).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledTimes(1);

    fireEvent.change(time, { target: { value: "" } });
    expect(tauri.setBackupSchedule).toHaveBeenCalledTimes(2);

    fireEvent.change(mode, { target: { value: "instant" } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("scheduleInstantSaved"));
  });

  it("puts the schedule back when the shell refuses it", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    tauri.setBackupSchedule.mockRejectedValue("Choose a time like 02:00.");
    render(<FolderBackup />);
    const mode = await screen.findByRole("combobox", { name: "scheduleTitle" });
    fireEvent.change(mode, { target: { value: "nightly" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Choose a time like 02:00."));
    expect(mode).toHaveValue("instant");
  });

  it("hides the schedule when the shell can't report it", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    tauri.getBackupSchedule.mockRejectedValue(new Error("old shell"));
    render(<FolderBackup />);
    await screen.findByText("Documents");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("reports a picker that fails and a removal the shell refuses, then cancels", async () => {
    tauri.listBackupFolders.mockResolvedValue([docs]);
    tauri.pickBackupFolder.mockRejectedValue({});
    tauri.removeBackupFolder.mockRejectedValue(new Error(""));
    render(<FolderBackup />);
    const add = await screen.findByRole("button", { name: "add" });
    fireEvent.click(add);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("addFailed"));

    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "removeConfirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("removeFailed"));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "removeConfirm" })).toBeNull());
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });
});
