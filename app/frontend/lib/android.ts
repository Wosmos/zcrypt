/**
 * Bridge to the Android shell's MainActivity (`window.ZcryptAndroid`). Absent
 * on web, desktop and older APKs, so every helper degrades to a no-op.
 */

interface AndroidBridge {
  isScreenCaptureAllowed(): boolean;
  setScreenCaptureAllowed(allowed: boolean): void;
  takeSharedFiles(): string;
}

/** Fired by the shell when files shared to zcrypt are ready to collect. */
export const SHARED_FILES_EVENT = "zcrypt:shared-files";

export function androidBridge(): AndroidBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ZcryptAndroid?: AndroidBridge }).ZcryptAndroid ?? null;
}

/** Drain the files other apps shared to zcrypt, as absolute paths the core
 *  can read. Each path is handed out once. */
export function takeSharedFiles(): string[] {
  const bridge = androidBridge();
  if (!bridge) return [];
  try {
    const parsed: unknown = JSON.parse(bridge.takeSharedFiles());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

/** Whether the app window may appear in screenshots and the recents view.
 *  Null when there is no Android shell to ask. */
export function isScreenCaptureAllowed(): boolean | null {
  const bridge = androidBridge();
  return bridge ? bridge.isScreenCaptureAllowed() : null;
}

export function setScreenCaptureAllowed(allowed: boolean): void {
  androidBridge()?.setScreenCaptureAllowed(allowed);
}
