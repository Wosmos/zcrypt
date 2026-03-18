"use client";

import type { PlatformStatus, RepoInfo } from "@/types";
import { formatBytes } from "@/lib/utils";
import { Github, AlertCircle } from "@/lib/icons";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import Link from "next/link";

interface PlatformHealthProps {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
}

const platformIcons: Record<string, React.ReactNode> = {
  github: <Github className="h-3.5 w-3.5" />,
  gitlab: <GitlabIcon className="h-3.5 w-3.5" />,
  huggingface: <HuggingFaceIcon className="h-3.5 w-3.5" />,
  telegram: <TelegramIcon className="h-3.5 w-3.5" />,
};

const platformLabels: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
  telegram: "Telegram",
};

export function PlatformHealth({ statuses, repos }: PlatformHealthProps) {
  // Only show platforms the user personally connected — hide global/admin tokens entirely
  const personalStatuses = statuses.filter((s) => s.connected && !s.is_global);
  if (personalStatuses.length === 0) return null;

  // Group repos by platform
  const reposByPlatform = repos.reduce<Record<string, RepoInfo[]>>((acc, r) => {
    (acc[r.platform] ??= []).push(r);
    return acc;
  }, {});

  const platforms = Array.from(new Set(personalStatuses.map((s) => s.platform)));

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
          Platforms
        </span>
        <Link
          href="/settings"
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Manage
        </Link>
      </div>
      <div className="space-y-3">
        {platforms.map((platform) => {
          const accounts = personalStatuses.filter((s) => s.platform === platform);
          const hasError = accounts.some((s) => s.error);
          const platformRepos = reposByPlatform[platform] || [];
          const used = platformRepos.reduce((s, r) => s + r.used_bytes, 0);
          const max = platformRepos.reduce((s, r) => s + r.max_bytes, 0);
          const percent = max > 0 ? Math.min((used / max) * 100, 100) : 0;

          return (
            <div key={platform} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-secondary)]">
                    {platformIcons[platform]}
                  </span>
                  <span className="text-xs font-medium">
                    {platformLabels[platform] ?? platform}
                  </span>
                  {accounts.length > 1 && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      ({accounts.length} accounts)
                    </span>
                  )}
                  <span className={`h-1.5 w-1.5 rounded-full ${hasError ? "bg-red-500" : "bg-cyan-500"}`} />
                </div>
                {platformRepos.length > 0 && (
                  <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {formatBytes(used)} / {formatBytes(max)}
                  </span>
                )}
              </div>

              {platformRepos.length > 0 && (
                <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      percent > 90 ? "bg-red-500" : percent > 70 ? "bg-amber-500" : "bg-cyan-500"
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}

              {hasError && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  <span>{accounts.find((a) => a.error)?.error}</span>
                </div>
              )}

              {platformRepos.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {platformRepos.length} repo{platformRepos.length !== 1 ? "s" : ""}
                  {platformRepos.some((r) => !r.active) && (
                    <span> ({platformRepos.filter((r) => r.active).length} active)</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
