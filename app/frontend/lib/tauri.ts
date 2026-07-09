/**
 * Tauri runtime detection and bridge.
 *
 * When running inside the Tauri desktop app, pipeline operations
 * (upload, download) are routed to the Go sidecar via Tauri invoke().
 * When running in a browser, the existing web worker pipeline is used.
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

/** Upload a file via the Go sidecar (desktop only, legacy remote path). */
export async function sidecarUpload(
  filePath: string,
  passphrase: string,
  _onProgress?: (progress: SidecarProgress) => void
): Promise<void> {
  return tauriInvoke("upload_file", {
    filePath,
    passphrase,
  });
}

/**
 * Local-first upload: encrypts locally via sidecar, stores in SQLite + disk.
 * Returns almost instantly — background sync pushes to cloud later.
 */
export async function localUpload(
  filePath: string,
  passphrase: string,
  profile?: string,
): Promise<void> {
  return tauriInvoke("local_upload", {
    filePath,
    passphrase,
    profile: profile ?? "normal",
  });
}

/** Start the background sync worker in the sidecar. */
export async function startSync(baseUrl: string, token: string): Promise<void> {
  return tauriInvoke("start_sync", { baseUrl, token });
}

/** Get sync status from the sidecar. */
export async function getSyncStatus(): Promise<SyncStats> {
  return tauriInvoke("sync_status");
}

/** Download a file via the Go sidecar (desktop only). */
export async function sidecarDownload(
  fileId: string,
  passphrase: string,
  savePath: string,
  _onProgress?: (progress: SidecarProgress) => void
): Promise<void> {
  return tauriInvoke("download_file", {
    fileId,
    passphrase,
    savePath,
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
