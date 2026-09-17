"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminGetDownloads, type AdminDownloadsResponse, type DownloadCount } from "@/lib/api";
import {
  CHART_TOOLTIP_CURSOR,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/components/analytics/chart-theme";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Download, Globe, User, Box } from "@/lib/icons";
import { toast } from "@/store/toast";

const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
] as const;

const PLATFORM_LABELS: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
};

/** A labelled horizontal bar list — used for every breakdown on this page. */
function Breakdown({
  title,
  rows,
  empty,
  labels,
}: {
  title: string;
  rows: DownloadCount[];
  empty: string;
  labels?: Record<string, string>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-[var(--color-text)]">
                  {labels?.[r.key] ?? r.key}
                </span>
                <span className="tabular-nums text-[var(--color-text-muted)]">{r.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-1)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DownloadsContent() {
  const [data, setData] = useState<AdminDownloadsResponse | null>(null);
  const [days, setDays] = useState<string>("30");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: string) => {
    setLoading(true);
    try {
      setData(await adminGetDownloads(Number(range)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load downloads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <LogoSpinner size={28} />
      </div>
    );
  }
  if (!data) return null;

  const { stats, github } = data;
  // GitHub counts everyone, including people who went straight to the releases
  // page and never touched our redirect — so it is the larger, and truer, total.
  const githubTotal = github.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Download} label="Downloads (tracked)" value={String(stats.total)} />
        <StatCard icon={Box} label={`Last ${days} days`} value={String(stats.last_30_days)} />
        <StatCard icon={Globe} label="Counted by GitHub" value={String(githubTotal)} />
        <StatCard icon={User} label="While signed in" value={String(stats.signed_in)} />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Downloads over time</h3>
          <ToggleGroup
            type="single"
            value={days}
            onValueChange={(v) => v && setDays(v)}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} aria-label={r.label}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {stats.daily.every((d) => d.count === 0) ? (
          <EmptyState
            icon={<Download className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="No downloads recorded yet"
            description="Installs are counted from the moment someone uses a /dl link on the site."
          />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-text-muted)"
                  tickFormatter={(d: string) => d.slice(5)}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-text-muted)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  cursor={CHART_TOOLTIP_CURSOR}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Downloads"
                  stroke="var(--color-accent)"
                  fill="url(#dlFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown
          title="Platform"
          rows={stats.platforms}
          labels={PLATFORM_LABELS}
          empty="No downloads yet."
        />
        <Breakdown title="Build" rows={stats.targets} empty="No downloads yet." />
        <Breakdown title="Version" rows={stats.versions} empty="No downloads yet." />
        <Breakdown
          title="Country"
          rows={stats.countries}
          empty="No country data — the CDN header is absent in local dev."
        />
        <Breakdown
          title="Referrer"
          rows={stats.referrers}
          empty="No referrers — direct links and bookmarks send none."
        />
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-1 text-sm font-semibold text-[var(--color-text)]">Counted by GitHub</h3>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Per-asset totals straight from the release. Includes people who downloaded from the
            releases page without passing through the site, which our own counter can never see.
          </p>
          {github.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Nothing reported yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {github
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((a) => (
                  <li
                    key={`${a.tag}/${a.name}`}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="truncate text-[var(--color-text)]">{a.name}</span>
                    <span className="tabular-nums text-[var(--color-text-muted)]">{a.count}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
