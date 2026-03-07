import { PlatformStatus } from "@/types";
import { Github, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";

interface PlatformCardProps {
  status: PlatformStatus;
}

const customIcons: Record<string, { component: React.FC<{ className?: string }>; color: string }> = {
  gitlab: { component: GitlabIcon, color: "text-orange-400" },
  huggingface: { component: HuggingFaceIcon, color: "text-yellow-400" },
};

const displayNames: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
};

const platformMeta: Record<
  string,
  { icon: typeof Github; color: string }
> = {
  github: {
    icon: Github,
    color: "text-zinc-200",
  },
};

export function PlatformCard({ status }: PlatformCardProps) {
  const meta = platformMeta[status.platform];
  const Icon = meta?.icon;
  const custom = customIcons[status.platform];

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200",
        status.connected
          ? "bg-emerald-500/5 border-emerald-800/25 hover:border-emerald-700/40"
          : "bg-zinc-900/40 border-zinc-800/50 hover:border-zinc-700/60"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center h-11 w-11 rounded-xl",
          status.connected
            ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
            : "bg-zinc-800/60"
        )}
      >
        {custom ? (
          <custom.component
            className={cn(
              "h-5 w-5",
              status.connected ? custom.color : "text-zinc-500"
            )}
          />
        ) : Icon ? (
          <Icon
            className={cn(
              "h-5 w-5",
              status.connected ? meta.color : "text-zinc-500"
            )}
          />
        ) : null}
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold text-zinc-100">
          {displayNames[status.platform] ?? status.platform}
        </p>
        {status.username && (
          <p className="text-xs text-zinc-500">@{status.username}</p>
        )}
        {status.error && (
          <p className="text-xs text-red-400 mt-0.5">{status.error}</p>
        )}
      </div>

      {status.connected ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-800/30 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <XCircle className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
