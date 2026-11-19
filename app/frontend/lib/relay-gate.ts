import type { QuotaInfo } from "@/types";
import { getQuota } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getQuotaData } from "@/store/quota";
import { relayFits, transferAllowance } from "@/lib/web-transfer-usage";
import { WebTransferLimitCode, WebTransferLimitError } from "@/lib/web-transfer-limit";

/** The quota as the server has it right now, kept in the shared cache; the cached copy if the call fails. */
export async function freshQuota(): Promise<QuotaInfo | null> {
  try {
    const quota = await getQuota();
    queryClient.setQueryData(qk.quota, quota);
    return quota;
  } catch {
    return getQuotaData();
  }
}

/**
 * Whether the rest of a transfer (`bytes` still to move, in a file of
 * `fileBytes`) fits what is left of both windows, judged on a fresh quota.
 * Only decides whether to go through the server or wait: the server still
 * enforces the allowance on every chunk.
 */
export async function relayFitsNow(bytes: number, fileBytes: number = bytes): Promise<boolean> {
  return relayFits(await freshQuota(), bytes, fileBytes);
}

/**
 * Why `bytes` more through the server would not fit, judged on a fresh quota:
 * the window that runs short (today's first), or null when it fits or the
 * account has no allowance. Lets a transfer stop before it spends anything.
 */
export async function relayShortfall(bytes: number): Promise<WebTransferLimitError | null> {
  const allowance = transferAllowance(await freshQuota());
  if (!allowance || bytes <= 0) return null;
  const short = (
    [
      [allowance.daily, WebTransferLimitCode.DailyExceeded],
      [allowance.monthly, WebTransferLimitCode.AllowanceExceeded],
    ] as const
  ).find(([w]) => w && bytes > w.remaining);
  if (!short) return null;
  const [w, code] = short;
  if (!w) return null;
  return new WebTransferLimitError(
    code,
    {
      limitBytes: w.limit,
      usedBytes: w.limit - w.remaining,
      resetsAt: w.resetsAt,
      neededBytes: bytes,
    },
    403,
  );
}
