import { ApiError } from "@/lib/http-error";
import { intlLocale } from "@/lib/i18n";
import { formatBytes } from "@/lib/utils";
import { tr } from "@/store/translate";

/** Error codes the server sends when it refuses a web upload that would pass through it. */
export const WebTransferLimitCode = {
  FileTooLarge: "relay_file_too_large",
  AllowanceExceeded: "relay_allowance_exceeded",
  DailyExceeded: "relay_daily_exceeded",
} as const;
export type WebTransferLimitCode = (typeof WebTransferLimitCode)[keyof typeof WebTransferLimitCode];

/** Where the desktop app is downloaded from. */
export const DESKTOP_DOWNLOAD_PATH = "/download";

/** The numbers behind a refused web upload. */
export interface WebTransferLimitInfo {
  limitBytes: number;
  /** How much of the daily or monthly allowance is gone. Only set for an allowance. */
  usedBytes?: number;
  /** When the daily or monthly allowance starts over (ISO 8601). Only set for an allowance. */
  resetsAt?: string;
  /** What a transfer needed that the allowance could not cover. Set when it was checked before starting. */
  neededBytes?: number;
}

/** A refused web upload, as the upload queue keeps it and the dialog explains it. */
export interface WebTransferLimit extends WebTransferLimitInfo {
  code: WebTransferLimitCode;
}

/** Whether the code means an allowance window (daily or monthly) ran out. */
export function isAllowanceCode(code: WebTransferLimitCode): boolean {
  return (
    code === WebTransferLimitCode.AllowanceExceeded || code === WebTransferLimitCode.DailyExceeded
  );
}

/** Whether `err` is the server turning a transfer away because an allowance window ran out. */
export function isAllowanceRefusal(err: unknown): boolean {
  if (err instanceof WebTransferLimitError) return isAllowanceCode(err.code);
  return (
    err instanceof ApiError &&
    (err.code === WebTransferLimitCode.AllowanceExceeded ||
      err.code === WebTransferLimitCode.DailyExceeded)
  );
}

/** The time of day an allowance starts over, in the reader's language. The server counts UTC days. */
export function formatResetTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(intlLocale(), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** The day the monthly allowance starts over, in the reader's language. The server counts UTC days. */
export function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(intlLocale(), {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The friendly, plain-words explanation shown for a refused web upload. */
export function webTransferLimitMessage(
  code: WebTransferLimitCode,
  info: WebTransferLimitInfo,
): string {
  const limit = formatBytes(info.limitBytes);
  if (code === WebTransferLimitCode.FileTooLarge) {
    return tr("toasts.webFileTooLarge", { limit });
  }
  if (info.neededBytes && info.resetsAt) {
    const values = {
      needed: formatBytes(info.neededBytes),
      left: formatBytes(Math.max(0, info.limitBytes - (info.usedBytes ?? 0))),
      limit,
    };
    return code === WebTransferLimitCode.DailyExceeded
      ? tr("toasts.webDailyShort", { ...values, time: formatResetTime(info.resetsAt) })
      : tr("toasts.webAllowanceShort", { ...values, date: formatResetDate(info.resetsAt) });
  }
  if (code === WebTransferLimitCode.DailyExceeded) {
    return info.resetsAt
      ? tr("toasts.webDailyUsed", { limit, time: formatResetTime(info.resetsAt) })
      : tr("toasts.webDailyUsedNoTime", { limit });
  }
  return info.resetsAt
    ? tr("toasts.webAllowanceUsed", { limit, date: formatResetDate(info.resetsAt) })
    : tr("toasts.webAllowanceUsedNoDate", { limit });
}

/** A web upload that is too big, or over the monthly allowance, to go through the server. Its message is already the friendly text. */
export class WebTransferLimitError extends ApiError {
  readonly code: WebTransferLimitCode;
  readonly info: WebTransferLimitInfo;

  constructor(code: WebTransferLimitCode, info: WebTransferLimitInfo, status: number) {
    super(webTransferLimitMessage(code, info), status);
    this.name = "WebTransferLimitError";
    this.code = code;
    this.info = info;
  }

  /** The refusal as plain data, for the upload queue and the dialog. */
  get limit(): WebTransferLimit {
    return { code: this.code, ...this.info };
  }
}

function isLimitCode(value: unknown): value is WebTransferLimitCode {
  return (
    value === WebTransferLimitCode.FileTooLarge ||
    value === WebTransferLimitCode.AllowanceExceeded ||
    value === WebTransferLimitCode.DailyExceeded
  );
}

/** Read a refused upload's response body. Returns null for any other error. */
export function webTransferLimitFrom(body: string, status: number): WebTransferLimitError | null {
  let data: {
    code?: unknown;
    limit_bytes?: unknown;
    used_bytes?: unknown;
    resets_at?: unknown;
  } | null;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isLimitCode(data?.code)) return null;
  const limitBytes = Number(data.limit_bytes) || 0;
  const resetsAt = typeof data.resets_at === "string" ? data.resets_at : undefined;
  const usedBytes = typeof data.used_bytes === "number" ? data.used_bytes : undefined;
  return new WebTransferLimitError(data.code, { limitBytes, usedBytes, resetsAt }, status);
}

/** The `tools` message key for someone downloading another person's link when
 *  the owner's transfer allowance ran out, or null for any other error. */
export function linkAllowanceKey(
  err: unknown,
): "pub.ownerDailyUsed" | "pub.ownerMonthlyUsed" | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code === WebTransferLimitCode.DailyExceeded) return "pub.ownerDailyUsed";
  if (err.code === WebTransferLimitCode.AllowanceExceeded) return "pub.ownerMonthlyUsed";
  return null;
}
