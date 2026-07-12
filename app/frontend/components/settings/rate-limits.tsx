"use client";

import type { PlatformStatus, RepoInfo } from "@/types";
import { AlertTriangle, CheckCircle2, Database, File, Zap } from "@/lib/icons";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import { formatBytes, cn, smartGridCols } from "@/lib/utils";
import { Section } from "@/components/ui/section";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RateLimitsProps {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
}

/**
 * Breaks a quota blurb like "850 MB / repo" or "5,000 req/hr (authenticated)"
 * into a big headline number/word plus a short caption, so the stat reads at
 * a glance instead of as a paragraph — the fine print (if any) moves to a
 * tooltip instead of wrapping the tile onto three lines.
 */
function parseStat(raw: string): { value: string; caption: string; note?: string } {
  const noteMatch = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const core = noteMatch ? noteMatch[1].trim() : raw.trim();
  const note = noteMatch?.[2];

  const slashMatch = core.match(/^(.*?) \/ (.*)$/);
  if (slashMatch) {
    return { value: slashMatch[1].trim(), caption: `per ${slashMatch[2].trim()}`, note };
  }

  const leadingNumber = core.match(/^(~?[\d,]+)\s+(.*)$/);
  if (leadingNumber) {
    return { value: leadingNumber[1], caption: leadingNumber[2], note };
  }

  return { value: core, caption: "", note };
}

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
        <ul className={cn("grid gap-4", smartGridCols(connectedPlatforms.length))}>
          <TooltipProvider delayDuration={300}>
          {connectedPlatforms.map((status) => {
            const meta = PLATFORM_BY_ID[status.platform as PlatformId];
            if (!meta) return null;

            const pRepos = platformRepos.get(status.platform) || [];
            const totalUsed = pRepos.reduce((s, r) => s + r.used_bytes, 0);
            const totalMax = pRepos.reduce((s, r) => s + r.max_bytes, 0);
            const usagePercent = totalMax > 0 ? (totalUsed / totalMax) * 100 : 0;
            const isHigh = usagePercent > 80;

            return (
              <li
                key={`${status.platform}:${status.username}`}
                className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlatformIcon platform={status.platform} className="h-4 w-4" />
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
                    { label: "Repo", icon: Database, value: meta.capacity },
                    { label: "File", icon: File, value: meta.fileLimit },
                    { label: "Rate", icon: Zap, value: meta.rateInfo },
                  ].map((item) => {
                    const { value, caption, note } = parseStat(item.value);
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className="flex flex-col gap-1 rounded-lg bg-[var(--color-surface-1)] px-2.5 py-2.5"
                      >
                        <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
                          <Icon className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[9px] uppercase tracking-wider">{item.label}</span>
                        </div>
                        <p className="text-sm font-semibold leading-tight text-[var(--color-text)]">
                          {value}
                        </p>
                        {caption && (
                          <p className="text-[10px] leading-tight text-[var(--color-text-muted)]">
                            {note ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default underline decoration-dotted decoration-[var(--color-text-muted)]/50 underline-offset-2">
                                    {caption}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">{note}</TooltipContent>
                              </Tooltip>
                            ) : (
                              caption
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
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
          </TooltipProvider>
        </ul>
      </Section>
    </div>
  );
}
