/**
 * Tauri runtime detection and bridge.
 *
 * When running inside the Tauri desktop app, pipeline operations
 * (upload, download) are routed to the in-process Go core via Tauri
 * invoke(). When running in a browser, the existing web worker pipeline
 * is used.
 */

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Invoke a Tauri command. No-op if not in Tauri. */
export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri) {
    throw new Error("tauriInvoke called outside Tauri runtime");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Open a native file picker dialog. Returns selected file paths. */
export async function pickFiles(
  options?: { multiple?: boolean; title?: string }
): Promise<string[]> {
  if (!isTauri) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    multiple: options?.multiple ?? true,
    title: options?.title ?? "Select files to upload",
  });
  if (!result) return [];
  if (Array.isArray(result)) return result as string[];
  return [result as string];
}

/**
 * A placeholder File carrying the absolute desktop path `pickFiles()`
 * resolved, so a native-picker result can flow through the same
 * `onFiles(files: File[])` contract the browser `<input type="file">` path
 * uses. It holds no bytes — the desktop upload pipeline reads straight from
 * disk via `.path`, never through browser File data.
 */
export interface DesktopFile extends File {
  path: string;
}

/** Wrap one native-picker path in a `DesktopFile`. */
export function toDesktopFile(path: string): DesktopFile {
  const name = path.split(/[/\\]/).pop() || path;
  const file = new File([], name) as DesktopFile;
  Object.defineProperty(file, "path", { value: path, enumerable: true });
  return file;
}

/** Open a native save dialog. Returns the selected path. */
export async function pickSaveLocation(
  defaultName: string
): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: defaultName });
}

/** Upload a file via the in-process core (desktop only, legacy remote path). */
export async function sidecarUpload(
  filePath: string,
  passphrase: string,
  platform?: string,
  _onProgress?: (progress: SidecarProgress) => void
): Promise<void> {
  return tauriInvoke("upload_file", {
    filePath,
    passphrase,
    platform,
  });
}

/**
 * Local-first upload: encrypts locally via the in-process core, stores in
 * SQLite + disk. Returns almost instantly — background sync pushes to cloud
 * later. Resolves to the local file id.
 */
export async function localUpload(
  filePath: string,
  passphrase: string,
  profile?: string,
): Promise<string> {
  return tauriInvoke("local_upload", {
    filePath,
    passphrase,
    profile: profile ?? "normal",
  });
}

/**
 * Start the background sync worker in the core. The refresh token is
 * required — without it, sync dies silently once the access token expires.
 */
export async function startSync(
  baseUrl: string,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  return tauriInvoke("start_sync", { baseUrl, accessToken, refreshToken });
}

/** Stop the background sync worker in the core. */
export async function stopSync(): Promise<void> {
  return tauriInvoke("stop_sync");
}

/** Get sync status from the core. */
export async function getSyncStatus(): Promise<SyncStats> {
  return tauriInvoke("sync_status");
}

/** Get the in-process core's readiness/version. */
export async function getEngineStatus(): Promise<EngineStatus> {
  return tauriInvoke("get_engine_status");
}

/** Download a file via the in-process core (desktop only). */
export async function sidecarDownload(
  fileId: string,
  passphrase: string,
  userId: string,
  savePath: string,
  _onProgress?: (progress: SidecarProgress) => void
): Promise<void> {
  return tauriInvoke("download_file", {
    fileId,
    passphrase,
    userId,
    savePath,
  });
}

/**
 * Decrypt a file to raw bytes IN MEMORY via the in-process core (desktop only) —
 * for thumbnails / preview / the in-app viewer. Returns the plaintext as an
 * ArrayBuffer (the command sends a raw byte IPC response, no base64). The core
 * caps this at 512 MiB; above that it errors and callers fall back to the
 * in-browser pipeline. Progress (when wanted) arrives on "zcrypt://progress".
 */
export async function sidecarDecryptToMemory(
  fileId: string,
  passphrase: string,
  userId: string
): Promise<ArrayBuffer> {
  return tauriInvoke<ArrayBuffer>("decrypt_to_memory", {
    fileId,
    passphrase,
    userId,
  });
}

/**
 * Download a shared-space file via the in-process core (desktop only), using
 * the space's symmetric key instead of the vault passphrase — works for the
 * owner and any member alike. `spaceKeyBytes` is the raw space key; base64
 * encoding for the IPC call happens here so callers just pass bytes.
 */
export async function sidecarDownloadSpace(
  fileId: string,
  spaceKeyBytes: Uint8Array,
  savePath: string
): Promise<void> {
  const { toBase64 } = await import("@/lib/crypto");
  return tauriInvoke("download_space_file", {
    fileId,
    spaceKeyB64: toBase64(spaceKeyBytes),
    savePath,
  });
}

/**
 * Decrypt a shared-space file to bytes in memory via the in-process core
 * (desktop only) — the space-key sibling of `sidecarDecryptToMemory`.
 */
export async function sidecarDecryptSpaceToMemory(
  fileId: string,
  spaceKeyBytes: Uint8Array
): Promise<ArrayBuffer> {
  const { toBase64 } = await import("@/lib/crypto");
  return tauriInvoke<ArrayBuffer>("decrypt_space_to_memory", {
    fileId,
    spaceKeyB64: toBase64(spaceKeyBytes),
  });
}

/**
 * Permanently delete a file via the in-process core (desktop only): removes
 * each chunk directly from the user's OWN storage where the device holds the
 * token (byos-direct, zero backend byte-handling), then purges the backend
 * metadata row. Chunks on a platform the device has no creds for are left for
 * the backend to clean up. Idempotent — safe to retry.
 */
export async function sidecarDeleteFile(fileId: string): Promise<void> {
  return tauriInvoke("delete_file", { fileId });
}

/** Read a secret from the OS keychain (service "app.zcrypt.desktop"). */
export async function keychainGet(key: string): Promise<string | null> {
  return tauriInvoke("keychain_get", { key });
}

/** Write a secret to the OS keychain. */
export async function keychainSet(key: string, value: string): Promise<void> {
  return tauriInvoke("keychain_set", { key, value });
}

/** Delete a secret from the OS keychain. */
export async function keychainDelete(key: string): Promise<void> {
  return tauriInvoke("keychain_delete", { key });
}

/**
 * Cache the vault passphrase in the shell (in-memory only, never persisted)
 * so the desktop core's background folder-watch agent can encrypt newly
 * dropped files without prompting. No-op outside Tauri. Call on unlock;
 * pair with `clearShellPassphrase` on lock/logout. Not yet wired to a caller
 * — see the passphrase store's `setPassphrase`/`clear`.
 */
export async function setShellPassphrase(passphrase: string): Promise<void> {
  if (!isTauri) return;
  return tauriInvoke("set_passphrase", { passphrase });
}

/** Forget the shell's cached passphrase. No-op outside Tauri. */
export async function clearShellPassphrase(): Promise<void> {
  if (!isTauri) return;
  return tauriInvoke("clear_passphrase");
}

/** Check for desktop app updates. {available:false} when unconfigured. */
export async function checkForUpdates(): Promise<UpdateInfo> {
  return tauriInvoke("check_for_updates");
}

/**
 * Whether Touch ID (or another local device-owner biometric) is available
 * right now. Always false outside Tauri. False on non-macOS targets and
 * whenever the Mac has no usable enrollment.
 */
export async function biometricAvailable(): Promise<boolean> {
  if (!isTauri) return false;
  return tauriInvoke<boolean>("biometric_available");
}

/**
 * Present the OS Touch ID prompt with `reason` as the shown text. Resolves
 * `false` outside Tauri, on user cancel, or on any declined/failed
 * authentication (not enrolled, locked out, denied, etc). Callers should
 * still guard against a rejected promise — the shell only rejects if the OS
 * never answers the request at all.
 */
export async function biometricAuthenticate(reason: string): Promise<boolean> {
  if (!isTauri) return false;
  return tauriInvoke<boolean>("biometric_authenticate", { reason });
}

/**
 * Subscribe to "zcrypt://progress" events emitted by the shell during
 * upload/download. No-op outside Tauri (resolves an empty unlisten fn).
 * Returns a function that unsubscribes when called.
 */
export async function subscribeProgress(
  cb: (progress: SidecarProgress) => void
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<SidecarProgress>("zcrypt://progress", (event) => {
    cb(event.payload);
  });
}

export interface SidecarProgress {
  file_id: string;
  file_name: string;
  stage: string;
  chunks_done: number;
  chunks_total: number;
  bytes_done: number;
  bytes_total: number;
  speed: number;
}

export interface SyncStats {
  pending_files: number;
  syncing_files: number;
  synced_files: number;
  error_files: number;
}

export interface EngineStatus {
  ready: boolean;
  version: string;
}

export interface UpdateInfo {
  available: boolean;
  version?: string;
}
