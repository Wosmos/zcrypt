/**
 * Photo backup in the Android app. The shell's background job
 * (android/PhotoBackupWorker.kt) does the work with the app closed; this page
 * only asks for photo access and hands it the schedule and network through
 * the `ZcryptAndroid` bridge. Absent on web, desktop and older APKs.
 */

export type PhotoAccess = "all" | "partial" | "none";

/** What the shell's job needs to schedule itself; the album choices live in the app (lib/tauri.ts). */
export interface PhotoBackupSettings {
  enabled: boolean;
  wifiOnly: boolean;
  chargingOnly: boolean;
}

export interface PhotoBackupState extends PhotoBackupSettings {
  access: PhotoAccess;
}

/** One album (Android media bucket) the phone has photos or videos in. */
export interface PhotoAlbum {
  bucketId: string;
  name: string;
  count: number;
  coverUri: string;
  kind: "photos" | "videos" | "mixed";
  camera: boolean;
}

interface PhotoBridge {
  photoBackupState(): string;
  requestPhotoAccess(): void;
  setPhotoBackup(json: string): void;
  runPhotoBackupNow(): void;
  openAppSettings(): void;
  listPhotoAlbums?(): string;
  photoAlbumThumbnail?(uri: string): string;
}

/** Fired by the shell with the photo access the person granted. */
export const PHOTO_ACCESS_EVENT = "zcrypt:photo-access";

function photoBridge(): PhotoBridge | null {
  /* v8 ignore start -- server render: there is no window to hold a bridge */
  if (typeof window === "undefined") return null;
  /* v8 ignore stop */
  const bridge = (window as unknown as { ZcryptAndroid?: Partial<PhotoBridge> }).ZcryptAndroid;
  return typeof bridge?.photoBackupState === "function" ? (bridge as PhotoBridge) : null;
}

export function photoBackupSupported(): boolean {
  return photoBridge() !== null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** The shell's photo backup settings and access, or null without a shell. */
export function readPhotoBackup(): PhotoBackupState | null {
  const bridge = photoBridge();
  if (!bridge) return null;
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(bridge.photoBackupState());
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    enabled: raw.enabled === true,
    wifiOnly: raw.wifi_only !== false,
    chargingOnly: raw.charging_only === true,
    access: oneOf(raw.access, ["all", "partial", "none"] as const, "none"),
  };
}

export function savePhotoBackup(settings: PhotoBackupSettings): void {
  photoBridge()?.setPhotoBackup(
    JSON.stringify({
      enabled: settings.enabled,
      wifi_only: settings.wifiOnly,
      charging_only: settings.chargingOnly,
    }),
  );
}

/** Asks Android for photo and video access; resolves with what was granted. */
export function requestPhotoAccess(): Promise<PhotoAccess> {
  const bridge = photoBridge();
  if (!bridge) return Promise.resolve("none");
  return new Promise((resolve) => {
    const onResult = (event: Event) => {
      window.removeEventListener(PHOTO_ACCESS_EVENT, onResult);
      resolve(oneOf((event as CustomEvent).detail, ["all", "partial", "none"] as const, "none"));
    };
    window.addEventListener(PHOTO_ACCESS_EVENT, onResult);
    bridge.requestPhotoAccess();
  });
}

export function runPhotoBackupNow(): void {
  photoBridge()?.runPhotoBackupNow();
}

/** Opens zcrypt's page in Android settings, where access to all photos is granted. */
export function openAppSettings(): void {
  photoBridge()?.openAppSettings();
}

/** The albums the phone's media library holds and the app may read, largest first. */
export function listPhotoAlbums(): PhotoAlbum[] {
  const bridge = photoBridge();
  if (!bridge?.listPhotoAlbums) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(bridge.listPhotoAlbums());
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a: Record<string, unknown>) =>
    typeof a?.bucket_id === "string" && a.bucket_id
      ? [
          {
            bucketId: a.bucket_id,
            name: typeof a.name === "string" ? a.name : "",
            count: typeof a.count === "number" ? a.count : 0,
            coverUri: typeof a.cover_uri === "string" ? a.cover_uri : "",
            kind: oneOf(a.kind, ["photos", "videos", "mixed"] as const, "mixed"),
            camera: a.camera === true,
          },
        ]
      : [],
  );
}

/** A small cover image for an album as a data URL, or "" when there is none. */
export function photoAlbumThumbnail(coverUri: string): string {
  const bridge = photoBridge();
  if (!bridge?.photoAlbumThumbnail || !coverUri) return "";
  try {
    const b64 = bridge.photoAlbumThumbnail(coverUri);
    return b64 ? `data:image/jpeg;base64,${b64}` : "";
  } catch {
    return "";
  }
}
