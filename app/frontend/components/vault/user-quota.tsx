"use client";

import type { QuotaInfo } from "@/types";
import { formatBytes } from "@/lib/utils";
import { Gauge, Infinity } from "@/lib/icons";

interface UserQuotaProps {
  quota: QuotaInfo;
}

export function UserQuota({ quota }: UserQuotaProps) {
  // Storage is unbounded — bounded only by the connected platform. Show usage,
  // never a fraction of a cap.
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Storage
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500">
          <Infinity className="h-3 w-3" /> Unlimited
        </span>
      </div>

      <div className="flex items-center gap-2 py-1">
        <Infinity className="h-4 w-4 text-cyan-500" />
        <div>
          <p className="text-sm font-medium">Unlimited storage</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatBytes(quota.used_bytes)} used
            {quota.has_personal_key && " · personal tokens connected"}
          </p>
        </div>
      </div>
    </div>
  );
}
