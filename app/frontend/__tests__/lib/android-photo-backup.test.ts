import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listPhotoAlbums,
  openAppSettings,
  PHOTO_ACCESS_EVENT,
  photoAlbumThumbnail,
  photoBackupSupported,
  readPhotoBackup,
  requestPhotoAccess,
  runPhotoBackupNow,
  savePhotoBackup,
} from "@/lib/android-photo-backup";

type Win = { ZcryptAndroid?: Record<string, unknown> };

function install(state: string, extra: Record<string, unknown> = {}) {
  const bridge = {
    ...extra,
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
    savePhotoBackup({ enabled: true, wifiOnly: true, chargingOnly: false });
    expect(listPhotoAlbums()).toEqual([]);
    expect(photoAlbumThumbnail("content://x/1")).toBe("");
    runPhotoBackupNow();
    openAppSettings();
    await expect(requestPhotoAccess()).resolves.toBe("none");

    (window as unknown as Win).ZcryptAndroid = { isScreenCaptureAllowed: () => false };
    expect(photoBackupSupported()).toBe(false);
  });

  it("reads the shell's settings and access", () => {
    install(JSON.stringify({ enabled: true, wifi_only: false, charging_only: true, access: "partial" }));
    expect(photoBackupSupported()).toBe(true);
    expect(readPhotoBackup()).toEqual({
      enabled: true,
      wifiOnly: false,
      chargingOnly: true,
      access: "partial",
    });
  });

  it("falls back to safe defaults for anything unexpected", () => {
    const defaults = { enabled: false, wifiOnly: true, chargingOnly: false, access: "none" };
    install(JSON.stringify({ enabled: "yes", wifi_only: "maybe", charging_only: 1, access: "root" }));
    expect(readPhotoBackup()).toEqual(defaults);
    install("not json");
    expect(readPhotoBackup()).toEqual(defaults);
    install("null");
    expect(readPhotoBackup()).toEqual(defaults);
  });

  it("hands settings, a run and the settings page to the shell", () => {
    const bridge = install("{}");
    savePhotoBackup({ enabled: true, wifiOnly: false, chargingOnly: true });
    expect(bridge.setPhotoBackup).toHaveBeenCalledWith(
      JSON.stringify({ enabled: true, wifi_only: false, charging_only: true }),
    );
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

  it("lists the albums the shell reports and ignores malformed ones", () => {
    install("{}", {
      listPhotoAlbums: vi.fn(() =>
        JSON.stringify([
          { bucket_id: "1", name: "Camera", count: 12, cover_uri: "content://c/1", kind: "mixed", camera: true },
          { bucket_id: "2", name: "WhatsApp Images", count: 3, cover_uri: "content://c/2", kind: "photos" },
          { bucket_id: "", name: "No id" },
          { name: "Also no id" },
          null,
        ]),
      ),
    });
    expect(listPhotoAlbums()).toEqual([
      { bucketId: "1", name: "Camera", count: 12, coverUri: "content://c/1", kind: "mixed", camera: true },
      { bucketId: "2", name: "WhatsApp Images", count: 3, coverUri: "content://c/2", kind: "photos", camera: false },
    ]);
  });

  it("falls back to empty values for album fields of the wrong type", () => {
    install("{}", {
      listPhotoAlbums: () => JSON.stringify([{ bucket_id: "9", name: 5, count: "x", cover_uri: null, kind: "odd" }]),
    });
    expect(listPhotoAlbums()).toEqual([
      { bucketId: "9", name: "", count: 0, coverUri: "", kind: "mixed", camera: false },
    ]);
  });

  it("gives no albums when the shell is older or answers badly", () => {
    install("{}");
    expect(listPhotoAlbums()).toEqual([]);
    install("{}", { listPhotoAlbums: () => "not json" });
    expect(listPhotoAlbums()).toEqual([]);
    install("{}", { listPhotoAlbums: () => '{"a":1}' });
    expect(listPhotoAlbums()).toEqual([]);
  });

  it("turns a cover thumbnail into a data URL, or nothing", () => {
    install("{}", { photoAlbumThumbnail: vi.fn((uri: string) => (uri === "content://c/1" ? "QUJD" : "")) });
    expect(photoAlbumThumbnail("content://c/1")).toBe("data:image/jpeg;base64,QUJD");
    expect(photoAlbumThumbnail("content://c/2")).toBe("");
    expect(photoAlbumThumbnail("")).toBe("");
    install("{}", {
      photoAlbumThumbnail: () => {
        throw new Error("bridge");
      },
    });
    expect(photoAlbumThumbnail("content://c/1")).toBe("");
  });
});
