"use client";

import type { QuotaInfo } from "@/types";
import { formatBytes } from "@/lib/utils";
import { Gauge, Zap, Infinity } from "@/lib/icons";

interface UserQuotaProps {
  quota: QuotaInfo;
}

export function UserQuota({ quota }: UserQuotaProps) {
  const hasLimit = !quota.is_unlimited && quota.quota_bytes > 0;
  const percent = hasLimit
    ? Math.min((quota.used_bytes / quota.quota_bytes) * 100, 100)
    : 0;
  const isHigh = percent > 80;
  const isCritical = percent > 95;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Your Quota
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            quota.plan === "pro"
              ? "bg-violet-500/10 text-violet-500"
              : quota.plan === "plus"
                ? "bg-blue-500/10 text-blue-500"
                : quota.plan === "team"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)]"
          }`}>
            {quota.plan}
          </span>
        </div>
      </div>

      {hasLimit ? (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-bold tabular-nums">
              {formatBytes(quota.used_bytes)}
            </span>
            <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
              of {formatBytes(quota.quota_bytes)}
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
              style={{ width: `${Math.max(percent, 1)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs font-medium ${
              isCritical ? "text-red-500" : isHigh ? "text-amber-500" : "text-[var(--color-text-muted)]"
            }`}>
              {percent.toFixed(0)}% used
            </span>
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
              {formatBytes(Math.max(0, quota.quota_bytes - quota.used_bytes))} remaining
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <Infinity className="h-4 w-4 text-cyan-500" />
          <div>
            <p className="text-sm font-medium">Unlimited storage</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {formatBytes(quota.used_bytes)} used
              {quota.has_personal_key && " \u00b7 personal tokens connected"}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--color-border)]">
        <Zap className="h-3 w-3 text-[var(--color-text-muted)]" />
        <span className="text-xs text-[var(--color-text-muted)]">
          {quota.max_concurrent_uploads} concurrent upload{quota.max_concurrent_uploads !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
