"use client";

import type { RepoInfo } from "@/types";
import { formatBytes } from "@/lib/utils";
import { Database } from "@/lib/icons";

interface StorageQuotaProps {
  repos: RepoInfo[];
}

export function StorageQuota({ repos }: StorageQuotaProps) {
  if (repos.length === 0) return null;

  const totalUsed = repos.reduce((sum, r) => sum + r.used_bytes, 0);
  const totalMax = repos.reduce((sum, r) => sum + r.max_bytes, 0);
  const percent = totalMax > 0 ? Math.min((totalUsed / totalMax) * 100, 100) : 0;
  const isHigh = percent > 80;
  const isCritical = percent > 95;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Storage
          </span>
        </div>
        <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
          {formatBytes(totalUsed)} / {formatBytes(totalMax)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCritical
              ? "bg-red-500"
              : isHigh
                ? "bg-amber-500"
                : "bg-cyan-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {isCritical && (
        <p className="text-xs text-red-500 mt-2">
          Storage almost full. Connect more repos or clean up files.
        </p>
      )}
      {isHigh && !isCritical && (
        <p className="text-xs text-amber-500 mt-2">
          Storage usage is high ({percent.toFixed(0)}%).
        </p>
      )}
      <div className="text-xs text-[var(--color-text-muted)] mt-2">
        {repos.length} repo{repos.length !== 1 ? "s" : ""} across {new Set(repos.map((r) => r.platform)).size} platform{new Set(repos.map((r) => r.platform)).size !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
