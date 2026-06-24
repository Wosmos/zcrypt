"use client";

import type { PlatformStatus, RepoInfo } from "@/types";
import { Github, AlertTriangle, CheckCircle2 } from "@/lib/icons";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { formatBytes } from "@/lib/utils";
import { Section } from "@/components/ui/section";

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
    <div className="panel p-6">
      <Section
        title="Platform quotas & limits"
        description="Known rate limits and storage quotas per connected platform."
      >
        <ul className="divide-y divide-[var(--color-border)]">
          {connectedPlatforms.map((status) => {
            const meta = platformMeta[status.platform];
            if (!meta) return null;

            const pRepos = platformRepos.get(status.platform) || [];
            const totalUsed = pRepos.reduce((s, r) => s + r.used_bytes, 0);
            const totalMax = pRepos.reduce((s, r) => s + r.max_bytes, 0);
            const usagePercent = totalMax > 0 ? (totalUsed / totalMax) * 100 : 0;
            const isHigh = usagePercent > 80;

            return (
              <li key={`${status.platform}:${status.username}`} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {meta.icon}
                    <span className="text-sm font-medium capitalize text-[var(--color-text)]">
                      {status.platform}
                    </span>
                    {status.username && (
                      <span className="truncate text-xs text-[var(--color-text-muted)]">
                        @{status.username}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {isHigh ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    )}
                    <span
                      className={`text-xs font-medium tabular-nums ${isHigh ? "text-amber-500" : "text-[var(--color-accent)]"}`}
                    >
                      {usagePercent.toFixed(0)}% used
                    </span>
                  </div>
                </div>

                {/* Quota details */}
                <div className="grid grid-cols-1 gap-2 xs:grid-cols-3">
                  {[
                    { label: "Repo limit", value: meta.repoLimit },
                    { label: "File limit", value: meta.fileLimit },
                    { label: "Rate limit", value: meta.rateInfo },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg bg-[var(--color-surface-1)] px-3 py-2.5 xs:block"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                        {item.label}
                      </p>
                      <p className="text-xs font-medium text-[var(--color-text)] xs:mt-0.5">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Usage bar */}
                {pRepos.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs tabular-nums text-[var(--color-text-secondary)]">
                      <span>{formatBytes(totalUsed)} used</span>
                      <span>{formatBytes(totalMax - totalUsed)} remaining</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isHigh ? "bg-amber-500" : "bg-[var(--color-accent)]"}`}
                        style={{ width: `${Math.min(100, usagePercent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
