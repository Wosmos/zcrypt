import { resolveWebDirect } from "@/lib/byos-direct";
import { Platform } from "@/lib/platforms";
import { isTauri } from "@/lib/tauri";
import {
  WebTransferLimitCode,
  WebTransferLimitError,
  type WebTransferLimit,
} from "@/lib/web-transfer-limit";
import { getQuotaData } from "@/store/quota";
import { useWebTransferNotice, type RefusedFile } from "@/store/web-transfer-notice";

/**
 * Whether a file is too big to upload from this browser. Only an upload whose
 * bytes would pass through the server is limited: a file that goes straight to
 * the user's own Telegram, or to HuggingFace (which the browser uploads to
 * directly), and anything in the desktop app, is never held back.
 */
export async function webFileLimitFor(
  size: number,
  platform?: string,
): Promise<WebTransferLimitError | null> {
  const limitBytes = getQuotaData()?.relay_max_file_bytes ?? 0;
  if (!limitBytes || size <= limitBytes) return null;
  if (isTauri || platform === Platform.HuggingFace) return null;
  if (await resolveWebDirect(platform)) return null;
  return new WebTransferLimitError(WebTransferLimitCode.FileTooLarge, { limitBytes }, 413);
}

/**
 * Explain a refused web upload in the "use the desktop app" dialog. Refusals
 * that share a `batch` collect in one dialog, and stay quiet once it was closed.
 */
export function showWebTransferLimit(
  limit: WebTransferLimit,
  file?: RefusedFile,
  batch?: string,
): void {
  useWebTransferNotice.getState().show(limit, file, batch);
}
