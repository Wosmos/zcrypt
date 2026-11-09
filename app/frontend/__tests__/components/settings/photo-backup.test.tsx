import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  listBackupFolders: vi.fn(),
  photoBackupEnable: vi.fn(),
  photoBackupDisable: vi.fn(),
}));
const bridge = vi.hoisted(() => ({
  readPhotoBackup: vi.fn(),
  requestPhotoAccess: vi.fn(),
  savePhotoBackup: vi.fn(),
  runPhotoBackupNow: vi.fn(),
  openAppSettings: vi.fn(),
}));
const ensureUserKeypair = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const withPassphrase = vi.hoisted(() => vi.fn((fn: (pp: string) => void) => fn("pp")));

vi.mock("@/lib/tauri", () => tauri);
vi.mock("@/lib/android-photo-backup", () => bridge);
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

import { PhotoBackup } from "@/components/settings/photo-backup";
import { useKeysStore } from "@/store/keys";

const off = { enabled: false, mode: "instant", time: "02:00", network: "wifi", access: "none" } as const;
const on = { ...off, enabled: true, access: "all" } as const;

describe("PhotoBackup", () => {
  beforeEach(() => {
    for (const fn of [...Object.values(tauri), ...Object.values(bridge)]) fn.mockReset();
    ensureUserKeypair.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    withPassphrase.mockClear();
    tauri.listBackupFolders.mockResolvedValue([]);
    useKeysStore.setState({ publicKey: new Uint8Array(32).fill(7) });
  });
  afterEach(cleanup);

  it("renders nothing outside the Android app", async () => {
    bridge.readPhotoBackup.mockReturnValue(null);
    const { container } = render(<PhotoBackup />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for photo access, seals to the account key and turns on", async () => {
    bridge.readPhotoBackup.mockReturnValue(off);
    bridge.requestPhotoAccess.mockResolvedValue("all");
    tauri.photoBackupEnable.mockResolvedValue([{ files: 3 }, { files: 4 }]);
    render(<PhotoBackup />);
    expect(await screen.findByText("off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("turnedOn"));
    expect(ensureUserKeypair).toHaveBeenCalledWith("pp");
    expect(tauri.photoBackupEnable).toHaveBeenCalledWith(btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
    expect(bridge.savePhotoBackup).toHaveBeenCalledWith({ enabled: true, mode: "instant", time: "02:00", network: "wifi" });
    expect(screen.getByText('status:{"count":7}')).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "networkTitle" })).toHaveValue("wifi");
  });

  it("stops when photo access is refused", async () => {
    bridge.readPhotoBackup.mockReturnValue(off);
    bridge.requestPhotoAccess.mockResolvedValue("none");
    render(<PhotoBackup />);
    fireEvent.click(await screen.findByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("needsAccess"));
    expect(withPassphrase).not.toHaveBeenCalled();
  });

  it("reports a failed turn-on and a missing account key", async () => {
    bridge.readPhotoBackup.mockReturnValue({ ...off, access: "partial" });
    tauri.photoBackupEnable.mockRejectedValue("No photo folders were found on this phone.");
    render(<PhotoBackup />);
    fireEvent.click(await screen.findByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No photo folders were found on this phone."));
    expect(bridge.requestPhotoAccess).not.toHaveBeenCalled();

    useKeysStore.setState({ publicKey: null });
    fireEvent.click(screen.getByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("keyUnavailable"));
  });

  it("changes network and schedule, and backs up now", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    render(<PhotoBackup />);
    fireEvent.change(await screen.findByRole("combobox", { name: "networkTitle" }), { target: { value: "mobile" } });
    expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: true, mode: "instant", time: "02:00", network: "mobile" });
    expect(screen.getAllByText("mobileDesc").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("combobox", { name: "scheduleTitle" }), { target: { value: "nightly" } });
    const time = screen.getByLabelText("timeLabel");
    fireEvent.change(time, { target: { value: "23:15" } });
    expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: true, mode: "nightly", time: "23:15", network: "mobile" });
    fireEvent.change(time, { target: { value: "" } });
    expect(bridge.savePhotoBackup).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/^nightlyDesc:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "runNow" }));
    expect(bridge.runPhotoBackupNow).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("runNowStarted");
  });

  it("offers access to all photos when only some or none are allowed", async () => {
    bridge.readPhotoBackup.mockReturnValue({ ...on, access: "partial" });
    render(<PhotoBackup />);
    expect(await screen.findByText("partialTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "allowAll" }));
    expect(bridge.openAppSettings).toHaveBeenCalled();
    cleanup();
    bridge.readPhotoBackup.mockReturnValue({ ...on, access: "none" });
    render(<PhotoBackup />);
    expect(await screen.findByText("noAccessTitle")).toBeInTheDocument();
  });

  it("turns off, and reports when it can't", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    tauri.photoBackupDisable.mockRejectedValueOnce(new Error(""));
    render(<PhotoBackup />);
    const toggle = await screen.findByRole("switch", { name: "title" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("turnOffFailed"));
    tauri.photoBackupDisable.mockResolvedValue(undefined);
    fireEvent.click(toggle);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("turnedOff"));
    expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: false, mode: "instant", time: "02:00", network: "wifi" });
  });

  it("re-reads access when the person comes back from Android settings", async () => {
    bridge.readPhotoBackup.mockReturnValueOnce({ ...on, access: "partial" }).mockReturnValue(on);
    tauri.listBackupFolders.mockRejectedValue(new Error("engine not connected"));
    render(<PhotoBackup />);
    expect(await screen.findByText("on")).toBeInTheDocument();
    expect(screen.getByText("partialTitle")).toBeInTheDocument();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByText("partialTitle")).toBeNull();
  });
});
