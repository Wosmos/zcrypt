import type { DiskWritable } from "@/lib/download-session";

/** Files at/above this size stream to disk (a Save-As prompt) instead of being
 *  assembled in memory; a browser that cannot stream is refused files this big. */
export const STREAM_TO_DISK_MIN_BYTES = 1024 * 1024 * 1024;

interface SaveFilePickerOptions {
  suggestedName?: string;
}
export type ShowSaveFilePicker = (
  options?: SaveFilePickerOptions,
) => Promise<{ createWritable(): Promise<DiskWritable> }>;

export function getSaveFilePicker(): ShowSaveFilePicker | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
}

/** Whether this browser can stream a download straight to disk. */
export function canStreamToDisk(): boolean {
  return getSaveFilePicker() !== undefined;
}

export type DiskChoice =
  | { kind: "disk"; writer: DiskWritable }
  | { kind: "memory" }
  | { kind: "cancelled" }
  | { kind: "unsupported" };

/**
 * Where a download of `size` bytes goes. Must be called on the click's
 * activation, before any other await. Under the threshold it stays in memory;
 * at or above it the Save-As picker opens, and a browser without one (or a lost
 * gesture) is "unsupported" so the caller can refuse instead of crashing a tab.
 */
export async function chooseDiskWriter(name: string, size: number): Promise<DiskChoice> {
  if (size < STREAM_TO_DISK_MIN_BYTES) return { kind: "memory" };
  const picker = getSaveFilePicker();
  if (!picker) return { kind: "unsupported" };
  try {
    const handle = await picker({ suggestedName: name });
    return { kind: "disk", writer: await handle.createWritable() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { kind: "cancelled" };
    return { kind: "unsupported" };
  }
}
