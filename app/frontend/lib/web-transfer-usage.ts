import type { QuotaInfo } from "@/types";

/** One allowance window (a UTC day or a UTC month), ready to draw as a meter. */
export interface AllowanceWindow {
  /** Bytes already moved through the server in this window. */
  used: number;
  limit: number;
  /** Bytes promised to uploads in progress. They count against the window already. */
  reserved: number;
  /** What is left: limit - used - reserved, never below 0. */
  remaining: number;
  /** 0 to 100, capped. Counts used and reserved bytes. */
  percent: number;
  /** 90% or more of the window is gone. */
  nearlyUsed: boolean;
  /** Less than a tenth is left. */
  low: boolean;
  /** All of it is gone, or more: binary units can make `used` read above `limit`. */
  usedUp: boolean;
  resetsAt?: string;
}

/** The transfer allowance: both windows, the per-file cap and what is left overall. */
export interface TransferAllowance {
  daily: AllowanceWindow | null;
  monthly: AllowanceWindow | null;
  /** Bytes promised to uploads in progress. */
  reserved: number;
  /** Largest file the server will carry. 0 = no cap. */
  maxFileBytes: number;
  /** The smaller of the two windows' remainders, or null when neither window has a limit. */
  remaining: number | null;
}

function windowOf(
  used: number | undefined,
  limit: number | undefined,
  reservedBytes: number,
  resetsAt: string | undefined,
): AllowanceWindow | null {
  if (!limit || limit <= 0) return null;
  const usedBytes = Math.max(0, used ?? 0);
  const committed = usedBytes + reservedBytes;
  const remaining = Math.max(0, limit - committed);
  return {
    used: usedBytes,
    limit,
    reserved: reservedBytes,
    remaining,
    percent: Math.min(100, (committed / limit) * 100),
    nearlyUsed: committed / limit >= 0.9,
    low: remaining / limit < 0.1,
    usedUp: committed >= limit,
    resetsAt,
  };
}

/** The daily and monthly meters, or null when the account has no transfer limits at all (admins). */
export function transferAllowance(quota: QuotaInfo | null | undefined): TransferAllowance | null {
  if (!quota) return null;
  const reserved = Math.max(0, quota.relay_reserved_bytes ?? 0);
  const daily = windowOf(
    quota.relay_day_used_bytes,
    quota.relay_day_limit_bytes,
    reserved,
    quota.relay_day_resets_at,
  );
  const monthly = windowOf(
    quota.relay_used_bytes,
    quota.relay_limit_bytes,
    reserved,
    quota.relay_resets_at,
  );
  const maxFileBytes = Math.max(0, quota.relay_max_file_bytes ?? 0);
  if (!daily && !monthly && maxFileBytes === 0) return null;
  const left = [daily, monthly].filter((w): w is AllowanceWindow => w !== null);
  return {
    daily,
    monthly,
    reserved,
    maxFileBytes,
    remaining: left.length ? Math.min(...left.map((w) => w.remaining)) : null,
  };
}

/** This month's meter alone, or null when there is no monthly limit. */
export function webTransferUsage(quota: QuotaInfo | null | undefined): AllowanceWindow | null {
  return transferAllowance(quota)?.monthly ?? null;
}

/**
 * Whether `bytes` more can go through the server right now: they fit what is
 * left in BOTH windows, and the file (`fileBytes`, default the same) is within
 * the per-file cap. With no quota to go on this says yes and leaves the call
 * to the server, which is the real check.
 */
export function relayFits(
  quota: QuotaInfo | null | undefined,
  bytes: number,
  fileBytes: number = bytes,
): boolean {
  if (!quota) return true;
  const allowance = transferAllowance(quota);
  if (!allowance) return true;
  if (allowance.maxFileBytes > 0 && fileBytes > allowance.maxFileBytes) return false;
  return allowance.remaining === null || bytes <= allowance.remaining;
}

/** The window that is running low (less than a tenth left), the emptiest first, or null. */
export function lowestWindow(quota: QuotaInfo | null | undefined): AllowanceWindow | null {
  const a = transferAllowance(quota);
  const low = [a?.daily, a?.monthly].filter((w): w is AllowanceWindow => !!w && w.low);
  if (low.length === 0) return null;
  return low.reduce((m, w) => (w.remaining / w.limit < m.remaining / m.limit ? w : m));
}
