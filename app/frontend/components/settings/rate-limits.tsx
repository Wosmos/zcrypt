"use client";

import type { PlatformStatus, RepoInfo } from "@/types";
import { Github, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { formatBytes } from "@/lib/utils";

interface RateLimitsProps {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
}

const platformMeta: Record<string, {
  icon: React.ReactNode;
  repoLimit: string;
  fileLimit: string;
  rateInfo: string;
}> = {
  github: {
    icon: <Github className="h-4 w-4" />,
    repoLimit: "1 GB / repo",
    fileLimit: "100 MB / file (LFS)",
    rateInfo: "5,000 req/hr (authenticated)",
  },
  gitlab: {
    icon: <GitlabIcon className="h-4 w-4 text-orange-500" />,
    repoLimit: "10 GB / repo",
    fileLimit: "5 GB / file (LFS)",
    rateInfo: "2,000 req/min (authenticated)",
  },
  huggingface: {
    icon: <HuggingFaceIcon className="h-4 w-4 text-yellow-500" />,
    repoLimit: "300 GB / repo",
    fileLimit: "50 GB / file (LFS)",
    rateInfo: "No strict rate limits",
  },
};

export function RateLimits({ statuses, repos }: RateLimitsProps) {
  const connectedPlatforms = statuses.filter((s) => s.connected);

  if (connectedPlatforms.length === 0) return null;

  // Group repos by platform for quota calculations
  const platformRepos = new Map<string, RepoInfo[]>();
  for (const r of repos) {
    const existing = platformRepos.get(r.platform) || [];
    existing.push(r);
    platformRepos.set(r.platform, existing);
  }

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold">Platform Quotas & Limits</h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Known rate limits and storage quotas per platform
        </p>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {connectedPlatforms.map((status) => {
          const meta = platformMeta[status.platform];
          if (!meta) return null;

          const pRepos = platformRepos.get(status.platform) || [];
          const totalUsed = pRepos.reduce((s, r) => s + r.used_bytes, 0);
          const totalMax = pRepos.reduce((s, r) => s + r.max_bytes, 0);
          const usagePercent = totalMax > 0 ? (totalUsed / totalMax) * 100 : 0;
          const isHigh = usagePercent > 80;

          return (
            <div key={`${status.platform}:${status.username}`} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {meta.icon}
                  <span className="text-sm font-medium capitalize">{status.platform}</span>
                  {status.username && (
                    <span className="text-[11px] text-[var(--color-text-muted)]">@{status.username}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isHigh ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  <span className={`text-[11px] font-medium ${isHigh ? "text-amber-500" : "text-emerald-500"}`}>
                    {usagePercent.toFixed(0)}% used
                  </span>
                </div>
              </div>

              {/* Quota details */}
              <div className="grid grid-cols-3 gap-3">
                <div className="px-3 py-2 rounded-lg bg-[var(--color-surface-1)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Repo Limit</p>
                  <p className="text-xs font-medium mt-0.5">{meta.repoLimit}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-[var(--color-surface-1)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">File Limit</p>
                  <p className="text-xs font-medium mt-0.5">{meta.fileLimit}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-[var(--color-surface-1)]">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Rate Limit</p>
                  <p className="text-xs font-medium mt-0.5">{meta.rateInfo}</p>
                </div>
              </div>

              {/* Usage bar */}
              {pRepos.length > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[var(--color-text-secondary)]">
                    <span>{formatBytes(totalUsed)} used</span>
                    <span>{formatBytes(totalMax - totalUsed)} remaining</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, usagePercent)}%`,
                        backgroundColor: isHigh ? "#f59e0b" : "#10b981",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
