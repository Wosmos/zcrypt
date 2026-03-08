"use client";

import { formatBytes } from "@/lib/utils";
import type { RepoInfo } from "@/types";
import { Github } from "lucide-react";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";

interface PlatformBreakdownProps {
  repos: RepoInfo[];
}

const platformIcons: Record<string, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  gitlab: <GitlabIcon className="h-4 w-4 text-orange-500" />,
  huggingface: <HuggingFaceIcon className="h-4 w-4 text-yellow-500" />,
};

const platformColors: Record<string, string> = {
  github: "#6366f1",
  gitlab: "#f97316",
  huggingface: "#eab308",
};

export function PlatformBreakdown({ repos }: PlatformBreakdownProps) {
  // Group repos by platform
  const platforms = new Map<string, { used: number; max: number; repoCount: number }>();
  for (const r of repos) {
    const key = r.platform;
    const existing = platforms.get(key) || { used: 0, max: 0, repoCount: 0 };
    existing.used += r.used_bytes;
    existing.max += r.max_bytes;
    existing.repoCount += 1;
    platforms.set(key, existing);
  }

  const entries = Array.from(platforms.entries());

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">Storage by Platform</h3>
      </div>
      <div className="p-5 space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No platforms connected</p>
        ) : (
          entries.map(([platform, data]) => {
            const percent = data.max > 0 ? Math.min(100, (data.used / data.max) * 100) : 0;
            const color = platformColors[platform] || "#6b7280";

            return (
              <div key={platform} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {platformIcons[platform] || null}
                    <span className="text-sm font-medium capitalize">{platform}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {data.repoCount} repo{data.repoCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                    {formatBytes(data.used)} / {formatBytes(data.max)}
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
