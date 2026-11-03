import { resolveWebDirect } from "@/lib/byos-direct";
import { Platform } from "@/lib/platforms";
import { isTauri } from "@/lib/tauri";
import {
  DESKTOP_DOWNLOAD_PATH,
  WebTransferLimitCode,
  WebTransferLimitError,
} from "@/lib/web-transfer-limit";
import { getQuotaData } from "@/store/quota";
import { toast } from "@/store/toast";
import { tr } from "@/store/translate";

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

/** Open the desktop app download page in a new tab, so uploads still running here keep going. */
export function openDesktopDownload(): void {
  window.open(DESKTOP_DOWNLOAD_PATH, "_blank", "noopener");
}

/** Tell the user why a web upload was held back, with a way to get the desktop app. */
export function showWebTransferLimit(err: WebTransferLimitError): void {
  toast.error(
    err.message,
    { label: tr("toasts.getDesktopApp"), onClick: openDesktopDownload },
    { key: `web-transfer-limit:${err.code}` },
  );
}
