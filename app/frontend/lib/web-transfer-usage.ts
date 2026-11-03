import type { QuotaInfo } from "@/types";

/** This month's web transfer usage, ready to draw as a meter. */
export interface WebTransferUsage {
  used: number;
  limit: number;
  /** 0 to 100, capped. */
  percent: number;
  /** 90% or more of the allowance is gone. */
  nearlyUsed: boolean;
  resetsAt?: string;
}

/** The meter for the monthly web transfer allowance, or null when there is no limit (admins, or a server without one). */
export function webTransferUsage(quota: QuotaInfo | null | undefined): WebTransferUsage | null {
  const limit = quota?.relay_limit_bytes ?? 0;
  if (!quota || limit <= 0) return null;
  const used = Math.max(0, quota.relay_used_bytes ?? 0);
  const percent = Math.min(100, (used / limit) * 100);
  return { used, limit, percent, nearlyUsed: percent >= 90, resetsAt: quota.relay_resets_at };
}
