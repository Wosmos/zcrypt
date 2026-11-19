import type { QuotaInfo } from "@/types";
import { getQuota } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { getQuotaData } from "@/store/quota";
import { relayFits } from "@/lib/web-transfer-usage";

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
