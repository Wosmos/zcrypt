/**
 * Photo backup in the Android app. The shell's background job
 * (android/PhotoBackupWorker.kt) does the work with the app closed; this page
 * only asks for photo access and hands it the schedule and network through
 * the `ZcryptAndroid` bridge. Absent on web, desktop and older APKs.
 */

export type PhotoAccess = "all" | "partial" | "none";
export type PhotoNetwork = "wifi" | "mobile" | "any";
export type PhotoMode = "instant" | "nightly";

export interface PhotoBackupSettings {
  enabled: boolean;
  mode: PhotoMode;
  time: string;
  network: PhotoNetwork;
}

export interface PhotoBackupState extends PhotoBackupSettings {
  access: PhotoAccess;
}

interface PhotoBridge {
  photoBackupState(): string;
  requestPhotoAccess(): void;
  setPhotoBackup(json: string): void;
  runPhotoBackupNow(): void;
  openAppSettings(): void;
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
    mode: oneOf(raw.mode, ["instant", "nightly"] as const, "instant"),
    time: typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : "02:00",
    network: oneOf(raw.network, ["wifi", "mobile", "any"] as const, "wifi"),
    access: oneOf(raw.access, ["all", "partial", "none"] as const, "none"),
  };
}

export function savePhotoBackup(settings: PhotoBackupSettings): void {
  photoBridge()?.setPhotoBackup(JSON.stringify(settings));
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
