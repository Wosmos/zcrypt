"use client";

import { cn } from "@/lib/utils";
import { Github } from "lucide-react";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import type { PlatformStatus } from "@/types";

interface PlatformSelectorProps {
  statuses: PlatformStatus[];
  selected: string | null;
  onSelect: (platform: string | null) => void;
}

const platformIcons: Record<string, React.ReactNode> = {
  github: <Github className="h-4 w-4" />,
  gitlab: <GitlabIcon className="h-4 w-4" />,
  huggingface: <HuggingFaceIcon className="h-4 w-4" />,
  telegram: <TelegramIcon className="h-4 w-4" />,
};

const platformLabels: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
  telegram: "Telegram",
};

export function PlatformSelector({
  statuses,
  selected,
  onSelect,
}: PlatformSelectorProps) {
  const connected = statuses.filter((s) => s.connected);

  if (connected.length === 0) return null;

  // Group by platform
  const platforms = Array.from(new Set(connected.map((s) => s.platform)));

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        Upload to
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 border",
            selected === null
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
          )}
        >
          Auto
        </button>
        {platforms.map((platform) => {
          const accounts = connected.filter((s) => s.platform === platform);
          const isSelected = selected === platform;
          return (
            <button
              key={platform}
              onClick={() => onSelect(isSelected ? null : platform)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 border",
                isSelected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
              )}
            >
              {platformIcons[platform]}
              <span>{platformLabels[platform] ?? platform}</span>
              {accounts.length > 1 && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  ({accounts.length})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
