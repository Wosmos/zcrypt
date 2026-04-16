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
  if (Array.isArray(result)) return result.map((r) => r.path);
  return [result.path];
}

/** Open a native save dialog. Returns the selected path. */
export async function pickSaveLocation(
  defaultName: string
): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: defaultName });
}

/** Upload a file via the Go sidecar (desktop only). */
export async function sidecarUpload(
  filePath: string,
  passphrase: string,
  onProgress?: (progress: SidecarProgress) => void
): Promise<void> {
  return tauriInvoke("upload_file", {
    filePath,
    passphrase,
  });
}

/** Download a file via the Go sidecar (desktop only). */
export async function sidecarDownload(
  fileId: string,
  passphrase: string,
  savePath: string,
  onProgress?: (progress: SidecarProgress) => void
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
