"use client";

import type { PlatformStatus, RepoInfo } from "@/types";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import { formatBytes, cn } from "@/lib/utils";
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

/**
 * Percent label that never reads a false "0%": a tiny but non-zero usage (e.g.
 * 1.4 GB of 363 GB = 0.385%) shows a decimal instead of rounding down to 0.
 * Only a genuinely empty platform reads "0".
 */
function formatPct(p: number): string {
  if (p <= 0) return "0";
  if (p >= 1) return Math.round(p).toString();
  return p < 0.1 ? p.toFixed(2) : p.toFixed(1);
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
    <div className="space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Platform quotas &amp; limits</h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Known rate limits and storage quotas per connected platform.
        </p>
      </div>
      {/* Mobile: horizontal snap-scroll, ~one card per view with a peek of the
          next. Desktop (sm+): a clean 3-up grid. */}
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible">
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
                className="relative flex h-full min-w-[72%] shrink-0 snap-center flex-col items-center gap-2.5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-5 text-center transition-all hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface-1)]/70 sm:min-w-0 sm:shrink sm:gap-2 sm:p-4"
              >
                {/* Dotted backdrop, fading out toward the bottom */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(var(--color-text-muted)_0.75px,transparent_0.75px)] [background-size:9px_9px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
                />
                {/* Blended platform watermark, bleeding off the top-right */}
                <div aria-hidden className="pointer-events-none absolute -right-4 -top-4 opacity-[0.07]">
                  <PlatformIcon platform={status.platform} className="h-24 w-24" />
                </div>
                {pRepos.length > 0 && (
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-[var(--color-surface-2)]/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-muted)] backdrop-blur-sm">
                    {pRepos.length} {pRepos.length === 1 ? "repo" : "repos"}
                  </span>
                )}
                {/* Ring gauge — the percentage lives inside the arc */}
                <div className="relative z-10 h-[64px] w-[64px]">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" className="fill-[var(--color-surface-2)]/30" />
                    <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="2.75" className="stroke-[var(--color-surface-2)]" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.min(100, usagePercent)} 100`}
                      className={cn("transition-all duration-700", isHigh ? "stroke-amber-500" : "stroke-[var(--color-accent)]")}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("font-heading font-bold tabular-nums tracking-tight", usagePercent > 0 && usagePercent < 1 ? "text-base" : "text-lg", isHigh ? "text-amber-500" : "text-[var(--color-text)]")}>
                      {formatPct(usagePercent)}
                      <span className="align-super text-[9px] font-semibold text-[var(--color-text-muted)]">%</span>
                    </span>
                  </div>
                </div>

                <div className="relative z-10 min-w-0">
                  <p className="truncate font-heading text-sm font-semibold capitalize text-[var(--color-text)]">
                    {status.platform}
                  </p>
                  <p className="truncate text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {pRepos.length > 0 ? `${formatBytes(totalUsed)} of ${formatBytes(totalMax)}` : status.username ? `@${status.username}` : " "}
                  </p>
                </div>

                {/* Limits — one whisper-light wrapped line, pinned to the bottom
                    so every tile aligns; the fine print shows on hover. */}
                <div className="relative z-10 mt-auto hidden flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 pt-1.5 text-[10px] leading-tight text-[var(--color-text-muted)] sm:flex">
                  {[meta.capacity, meta.fileLimit, meta.rateInfo].map((raw, i) => {
                    const { value, note } = parseStat(raw);
                    return (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span aria-hidden className="text-[var(--color-border)]">·</span>}
                        {note ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default underline decoration-dotted decoration-[var(--color-text-muted)]/40 underline-offset-2">{value}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top">{note}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span>{value}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </TooltipProvider>
      </ul>
    </div>
  );
}
