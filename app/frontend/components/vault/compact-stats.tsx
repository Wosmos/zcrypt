"use client";

import { formatBytes, formatDate } from "@/lib/utils";
import { Layers, HardDrive, TrendingDown, Clock } from "lucide-react";

interface CompactStatsProps {
  fileCount: number;
  totalSize: number;
  totalEncrypted: number;
  lastUploadDate?: string;
}

export function CompactStats({ fileCount, totalSize, totalEncrypted, lastUploadDate }: CompactStatsProps) {
  const savings = totalSize > 0 ? ((1 - totalEncrypted / totalSize) * 100).toFixed(0) : "0";

  if (fileCount === 0) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)] tabular-nums flex-wrap">
      <span className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        {fileCount} file{fileCount !== 1 ? "s" : ""}
      </span>
      <span className="h-3 w-px bg-[var(--color-border)]" />
      <span className="flex items-center gap-1.5">
        <HardDrive className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        {formatBytes(totalSize)}
      </span>
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
