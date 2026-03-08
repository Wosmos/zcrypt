import { PlatformStatus } from "@/types";
import { Github, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";

interface PlatformCardProps {
  status: PlatformStatus;
}

const customIcons: Record<string, { component: React.FC<{ className?: string }>; color: string }> = {
  gitlab: { component: GitlabIcon, color: "text-orange-500 dark:text-orange-400" },
  huggingface: { component: HuggingFaceIcon, color: "text-yellow-500 dark:text-yellow-400" },
};

const displayNames: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
};

export function PlatformCard({ status }: PlatformCardProps) {
  const custom = customIcons[status.platform];

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200",
        status.connected
          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/30"
          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center h-11 w-11 rounded-xl",
          status.connected
            ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
            : "bg-[var(--color-surface-1)]"
        )}
      >
        {custom ? (
          <custom.component
            className={cn(
              "h-5 w-5",
              status.connected ? custom.color : "text-[var(--color-text-muted)]"
            )}
          />
        ) : (
          <Github
            className={cn(
              "h-5 w-5",
              status.connected ? "" : "text-[var(--color-text-muted)]"
            )}
          />
        )}
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold">
          {displayNames[status.platform] ?? status.platform}
        </p>
        {status.username && (
          <p className="text-xs text-[var(--color-text-secondary)]">@{status.username}</p>
        )}
        {status.error && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{status.error}</p>
        )}
      </div>

      {status.connected ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <XCircle className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
