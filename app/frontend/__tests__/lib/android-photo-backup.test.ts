import { describe, it, expect, vi, afterEach } from "vitest";
import {
  openAppSettings,
  PHOTO_ACCESS_EVENT,
  photoBackupSupported,
  readPhotoBackup,
  requestPhotoAccess,
  runPhotoBackupNow,
  savePhotoBackup,
} from "@/lib/android-photo-backup";

type Win = { ZcryptAndroid?: Record<string, unknown> };

function install(state: string) {
  const bridge = {
    photoBackupState: vi.fn(() => state),
    requestPhotoAccess: vi.fn(),
    setPhotoBackup: vi.fn(),
    runPhotoBackupNow: vi.fn(),
    openAppSettings: vi.fn(),
  };
  (window as unknown as Win).ZcryptAndroid = bridge;
  return bridge;
}

afterEach(() => {
  delete (window as unknown as Win).ZcryptAndroid;
});

describe("android photo backup bridge", () => {
  it("does nothing without the shell, or with an older one", async () => {
    expect(photoBackupSupported()).toBe(false);
    expect(readPhotoBackup()).toBeNull();
    savePhotoBackup({ enabled: true, mode: "instant", time: "02:00", network: "wifi" });
    runPhotoBackupNow();
    openAppSettings();
    await expect(requestPhotoAccess()).resolves.toBe("none");

    (window as unknown as Win).ZcryptAndroid = { isScreenCaptureAllowed: () => false };
    expect(photoBackupSupported()).toBe(false);
  });

  it("reads the shell's settings and access", () => {
    install(JSON.stringify({ enabled: true, mode: "nightly", time: "23:30", network: "mobile", access: "partial" }));
    expect(photoBackupSupported()).toBe(true);
    expect(readPhotoBackup()).toEqual({
      enabled: true,
      mode: "nightly",
      time: "23:30",
      network: "mobile",
      access: "partial",
    });
  });

  it("falls back to safe defaults for anything unexpected", () => {
    const defaults = { enabled: false, mode: "instant", time: "02:00", network: "wifi", access: "none" };
    install(JSON.stringify({ enabled: "yes", mode: "hourly", time: "9:00", network: "5g", access: "root" }));
    expect(readPhotoBackup()).toEqual(defaults);
    install("not json");
    expect(readPhotoBackup()).toEqual(defaults);
    install("null");
    expect(readPhotoBackup()).toEqual(defaults);
  });

  it("hands settings, a run and the settings page to the shell", () => {
    const bridge = install("{}");
    const settings = { enabled: true, mode: "nightly" as const, time: "01:15", network: "any" as const };
    savePhotoBackup(settings);
    expect(bridge.setPhotoBackup).toHaveBeenCalledWith(JSON.stringify(settings));
    runPhotoBackupNow();
    expect(bridge.runPhotoBackupNow).toHaveBeenCalled();
    openAppSettings();
    expect(bridge.openAppSettings).toHaveBeenCalled();
  });

  it("asks for photo access and resolves with what Android granted", async () => {
    const bridge = install("{}");
    bridge.requestPhotoAccess.mockImplementation(() =>
      window.dispatchEvent(new CustomEvent(PHOTO_ACCESS_EVENT, { detail: "all" })),
    );
    await expect(requestPhotoAccess()).resolves.toBe("all");

    bridge.requestPhotoAccess.mockImplementation(() =>
      window.dispatchEvent(new CustomEvent(PHOTO_ACCESS_EVENT, { detail: 42 })),
    );
    await expect(requestPhotoAccess()).resolves.toBe("none");
  });
});
