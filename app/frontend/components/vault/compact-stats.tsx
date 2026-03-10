"use client";

import { formatBytes, formatDate } from "@/lib/utils";
import { Layers, HardDrive, TrendingDown, Clock, Infinity } from "lucide-react";
import type { QuotaInfo } from "@/types";

interface CompactStatsProps {
  fileCount: number;
  totalSize: number;
  totalEncrypted: number;
  lastUploadDate?: string;
  quotaInfo?: QuotaInfo | null;
}

export function CompactStats({ fileCount, totalSize, totalEncrypted, lastUploadDate, quotaInfo }: CompactStatsProps) {
  const savings = totalSize > 0 ? ((1 - totalEncrypted / totalSize) * 100).toFixed(0) : "0";

  if (fileCount === 0) return null;

  const hasLimit = quotaInfo && !quotaInfo.is_unlimited && quotaInfo.quota_bytes > 0;
  const quotaPercent = hasLimit
    ? Math.round((quotaInfo.used_bytes / quotaInfo.quota_bytes) * 100)
    : null;

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)] tabular-nums flex-wrap">
      <span className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        {fileCount} file{fileCount !== 1 ? "s" : ""}
      </span>
      <span className="h-3 w-px bg-[var(--color-border)]" />
      <span className="flex items-center gap-1.5">
        <HardDrive className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        {hasLimit ? (
          <>
            {formatBytes(quotaInfo.used_bytes)} / {formatBytes(quotaInfo.quota_bytes)}
          </>
        ) : quotaInfo ? (
          <>
            {formatBytes(quotaInfo.used_bytes)}
            <Infinity className="h-3 w-3 text-emerald-500 ml-0.5" />
          </>
        ) : (
          formatBytes(totalSize)
        )}
      </span>
      {quotaPercent !== null && quotaPercent >= 80 && (
        <>
          <span className="h-3 w-px bg-[var(--color-border)]" />
          <span className={`flex items-center gap-1.5 font-medium ${quotaPercent >= 95 ? "text-red-500" : "text-amber-500"}`}>
            {quotaPercent}% used
          </span>
        </>
      )}
      <span className="h-3 w-px bg-[var(--color-border)]" />
      <span className="flex items-center gap-1.5">
        <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
        {savings}% saved
      </span>
      {lastUploadDate && (
        <>
          <span className="h-3 w-px bg-[var(--color-border)]" />
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            {formatDate(lastUploadDate)}
          </span>
        </>
      )}
    </div>
  );
}
