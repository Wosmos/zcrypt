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

/** Check for desktop app updates. {available:false} when unconfigured. */
export async function checkForUpdates(): Promise<UpdateInfo> {
  return tauriInvoke("check_for_updates");
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
