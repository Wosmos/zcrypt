import { resolveWebDirect } from "@/lib/byos-direct";
import { desktopAppAction } from "@/lib/open-desktop-app";
import { Platform } from "@/lib/platforms";
import { isTauri } from "@/lib/tauri";
import { WebTransferLimitCode, WebTransferLimitError } from "@/lib/web-transfer-limit";
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

/** Tell the user why a web upload was held back, with a way into the desktop app. */
export function showWebTransferLimit(err: WebTransferLimitError): void {
  toast.error(err.message, desktopAppAction(), {
    key: `web-transfer-limit:${err.code}`,
    detail: tr("toasts.desktopHandoff"),
  });
}
