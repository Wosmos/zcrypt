"use client";

import { formatBytes } from "@/lib/utils";
import type { PlatformStatus, RepoInfo } from "@/types";
import { Github } from "@/lib/icons";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import { PLATFORM_COLORS, platformName } from "@/lib/platforms";

interface PlatformBreakdownProps {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
}

const platformIcons: Record<string, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  gitlab: <GitlabIcon className="h-4 w-4 text-orange-500" />,
  huggingface: <HuggingFaceIcon className="h-4 w-4 text-yellow-500" />,
  telegram: <TelegramIcon className="h-4 w-4 text-sky-500" />,
};

export function PlatformBreakdown({ statuses, repos }: PlatformBreakdownProps) {
  // Usage is aggregated from the storage repos (a repo row is created on the
  // first upload to a platform).
  const usage = new Map<string, { used: number; max: number; repoCount: number }>();
  for (const r of repos) {
    const existing = usage.get(r.platform) || { used: 0, max: 0, repoCount: 0 };
    existing.used += r.used_bytes;
    existing.max += r.max_bytes;
    existing.repoCount += 1;
    usage.set(r.platform, existing);
  }

  // Show every connected platform — including ones with no uploads yet (0 B) —
  // so a freshly-linked platform like Telegram appears here instead of vanishing
  // until its first upload. Union in any platform that has repos as a fallback.
  const platforms = Array.from(
    new Set([
      ...statuses.filter((s) => s.connected).map((s) => s.platform),
      ...repos.map((r) => r.platform),
    ])
  );

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Storage by platform</h3>
      </div>
      <div className="space-y-4 p-5">
        {platforms.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">No platforms connected</p>
        ) : (
          platforms.map((platform) => {
            const data = usage.get(platform) || { used: 0, max: 0, repoCount: 0 };
            const percent = data.max > 0 ? Math.min(100, (data.used / data.max) * 100) : 0;
            const color = PLATFORM_COLORS[platform] || "#6b7280";
            const label = platformName(platform);
            const hasUploads = data.repoCount > 0;

            return (
              <div key={platform} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {platformIcons[platform] || null}
                    <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {hasUploads
                        ? `${data.repoCount} repo${data.repoCount !== 1 ? "s" : ""}`
                        : "no uploads yet"}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                    {hasUploads ? `${formatBytes(data.used)} / ${formatBytes(data.max)}` : "0 B"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${percent}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
