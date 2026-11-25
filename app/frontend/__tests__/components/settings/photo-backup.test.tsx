import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  photoBackupEnable: vi.fn(),
  photoBackupDisable: vi.fn(),
  photoBackupOptions: vi.fn(),
  photoBackupSetOptions: vi.fn(),
}));
const bridge = vi.hoisted(() => ({
  readPhotoBackup: vi.fn(),
  requestPhotoAccess: vi.fn(),
  savePhotoBackup: vi.fn(),
  runPhotoBackupNow: vi.fn(),
  openAppSettings: vi.fn(),
  listPhotoAlbums: vi.fn(),
  photoAlbumThumbnail: vi.fn(),
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

const off = { enabled: false, wifiOnly: true, chargingOnly: false, access: "none" } as const;
const on = { ...off, enabled: true, access: "all" } as const;
const camera = { bucketId: "cam", name: "Camera", count: 12, coverUri: "content://c/1", kind: "mixed", camera: true };
const whatsapp = { bucketId: "wa", name: "WhatsApp Images", count: 3, coverUri: "content://c/2", kind: "photos", camera: false };
const saved = { albums: null, kinds: "both", wifi_only: true, charging_only: false, files: 7 } as const;

describe("PhotoBackup", () => {
  beforeEach(() => {
    for (const fn of [...Object.values(tauri), ...Object.values(bridge)]) fn.mockReset();
    ensureUserKeypair.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    withPassphrase.mockClear();
    tauri.photoBackupOptions.mockResolvedValue(saved);
    tauri.photoBackupSetOptions.mockResolvedValue(undefined);
    bridge.listPhotoAlbums.mockReturnValue([camera, whatsapp]);
    bridge.photoAlbumThumbnail.mockReturnValue("");
    useKeysStore.setState({ publicKey: new Uint8Array(32).fill(7) });
  });
  afterEach(cleanup);

  it("renders nothing outside the Android app", async () => {
    bridge.readPhotoBackup.mockReturnValue(null);
    const { container } = render(<PhotoBackup />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for photo access, seals to the account key, turns on and switches Camera on", async () => {
    bridge.readPhotoBackup.mockReturnValue(off);
    bridge.requestPhotoAccess.mockResolvedValue("all");
    tauri.photoBackupEnable.mockResolvedValue(saved);
    render(<PhotoBackup />);
    expect(await screen.findByText("off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("turnedOn"));
    expect(ensureUserKeypair).toHaveBeenCalledWith("pp");
    expect(tauri.photoBackupEnable).toHaveBeenCalledWith(btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
    expect(tauri.photoBackupSetOptions).toHaveBeenCalledWith({ ...saved, albums: ["cam"] });
    expect(bridge.savePhotoBackup).toHaveBeenCalledWith({ enabled: true, wifiOnly: true, chargingOnly: false });
    expect(screen.getByText('status:{"count":7}')).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Camera" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "WhatsApp Images" })).not.toBeChecked();
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
    tauri.photoBackupEnable.mockRejectedValue("Couldn't reach the server.");
    render(<PhotoBackup />);
    fireEvent.click(await screen.findByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't reach the server."));
    expect(bridge.requestPhotoAccess).not.toHaveBeenCalled();

    useKeysStore.setState({ publicKey: null });
    fireEvent.click(screen.getByRole("switch", { name: "title" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("keyUnavailable"));
  });

  it("lists the albums with their size and shows a cover when the phone has one", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    bridge.photoAlbumThumbnail.mockImplementation((uri: string) =>
      uri === "content://c/1" ? "data:image/jpeg;base64,QUJD" : "",
    );
    const { container } = render(<PhotoBackup />);
    expect(await screen.findByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Images")).toBeInTheDocument();
    expect(screen.getByText('albumCount:{"count":12}')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "data:image/jpeg;base64,QUJD"));
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("turns an album on and off through the saved choices", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    render(<PhotoBackup />);
    const wa = await screen.findByRole("switch", { name: "WhatsApp Images" });
    expect(screen.getByRole("switch", { name: "Camera" })).toBeChecked();
    await waitFor(() => expect(wa).toBeEnabled());
    fireEvent.click(wa);
    await waitFor(() =>
      expect(tauri.photoBackupSetOptions).toHaveBeenLastCalledWith({ ...saved, albums: ["cam", "wa"] }),
    );
    await waitFor(() => expect(wa).toBeChecked());
    fireEvent.click(screen.getByRole("switch", { name: "Camera" }));
    await waitFor(() =>
      expect(tauri.photoBackupSetOptions).toHaveBeenLastCalledWith({ ...saved, albums: ["wa"] }),
    );
  });

  it("changes photos or videos and saves it", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    render(<PhotoBackup />);
    const kinds = await screen.findByRole("combobox", { name: "kindsTitle" });
    await waitFor(() => expect(kinds).toBeEnabled());
    fireEvent.change(kinds, { target: { value: "videos" } });
    await waitFor(() =>
      expect(tauri.photoBackupSetOptions).toHaveBeenCalledWith({ ...saved, kinds: "videos" }),
    );
  });

  it("changes Wi-Fi only and while charging, and tells the shell so it can schedule", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    render(<PhotoBackup />);
    const wifi = await screen.findByRole("switch", { name: "wifiTitle" });
    const charging = screen.getByRole("switch", { name: "chargingTitle" });
    expect(wifi).toBeChecked();
    expect(charging).not.toBeChecked();
    await waitFor(() => expect(wifi).toBeEnabled());
    fireEvent.click(wifi);
    await waitFor(() =>
      expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: true, wifiOnly: false, chargingOnly: false }),
    );
    expect(tauri.photoBackupSetOptions).toHaveBeenLastCalledWith({ ...saved, wifi_only: false });
    fireEvent.click(charging);
    await waitFor(() =>
      expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: true, wifiOnly: false, chargingOnly: true }),
    );
  });

  it("says so when saving fails and keeps the old choice", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    tauri.photoBackupSetOptions.mockRejectedValue(new Error("db"));
    render(<PhotoBackup />);
    const wifi = await screen.findByRole("switch", { name: "wifiTitle" });
    await waitFor(() => expect(wifi).toBeEnabled());
    fireEvent.click(wifi);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("saveFailed"));
    expect(wifi).toBeChecked();
    expect(bridge.savePhotoBackup).not.toHaveBeenCalled();
  });

  it("backs up now", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    render(<PhotoBackup />);
    fireEvent.click(await screen.findByRole("button", { name: "runNow" }));
    expect(bridge.runPhotoBackupNow).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("runNowStarted");
  });

  it("says only some photos are allowed and re-requests access, then lists everything", async () => {
    bridge.readPhotoBackup.mockReturnValue({ ...on, access: "partial" });
    bridge.requestPhotoAccess.mockResolvedValue("all");
    render(<PhotoBackup />);
    expect(await screen.findByText("partialTitle")).toBeInTheDocument();
    expect(screen.getByText("partialDesc")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "allowAll" }));
    await waitFor(() => expect(screen.queryByText("partialTitle")).toBeNull());
    expect(bridge.requestPhotoAccess).toHaveBeenCalled();
    expect(bridge.openAppSettings).not.toHaveBeenCalled();
  });

  it("opens Android settings when the system won't ask again", async () => {
    bridge.readPhotoBackup.mockReturnValue({ ...on, access: "partial" });
    bridge.requestPhotoAccess.mockResolvedValue("partial");
    render(<PhotoBackup />);
    fireEvent.click(await screen.findByRole("button", { name: "allowAll" }));
    await waitFor(() => expect(bridge.openAppSettings).toHaveBeenCalled());
    expect(screen.getByText("partialTitle")).toBeInTheDocument();
  });

  it("shows no albums and asks for access when none is granted", async () => {
    bridge.readPhotoBackup.mockReturnValue({ ...on, access: "none" });
    render(<PhotoBackup />);
    expect(await screen.findByText("noAccessTitle")).toBeInTheDocument();
    expect(bridge.listPhotoAlbums).not.toHaveBeenCalled();
  });

  it("says there is nothing to show when the library is empty", async () => {
    bridge.readPhotoBackup.mockReturnValue(on);
    bridge.listPhotoAlbums.mockReturnValue([]);
    render(<PhotoBackup />);
    expect(await screen.findByText("albumsEmpty")).toBeInTheDocument();
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
    expect(bridge.savePhotoBackup).toHaveBeenLastCalledWith({ enabled: false, wifiOnly: true, chargingOnly: false });
    expect(screen.queryByText("Camera")).toBeNull();
  });

  it("re-reads access when the person comes back from Android settings", async () => {
    bridge.readPhotoBackup.mockReturnValueOnce({ ...on, access: "partial" }).mockReturnValue(on);
    tauri.photoBackupOptions.mockRejectedValue(new Error("engine not connected"));
    render(<PhotoBackup />);
    expect(await screen.findByText("on")).toBeInTheDocument();
    expect(screen.getByText("partialTitle")).toBeInTheDocument();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByText("partialTitle")).toBeNull();
  });
});
