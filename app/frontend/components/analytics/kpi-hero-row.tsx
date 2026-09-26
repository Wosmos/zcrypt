"use client";

import { KpiCard, type KpiCardTrend } from "@/components/ui/kpi-card";
import { formatBytes } from "@/lib/utils";
import { HardDrive, Layers, TrendingDown } from "@/lib/icons";
import type { AnalyticsSummary } from "@/lib/api";

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Monochrome up/down trend chip only (no red/green semantic colors, to keep
 *  the app's single-accent design language). Omitted entirely for "All time",
 *  where there's no meaningful previous period to compare against. */
function trendFor(current: number, previous: number, showTrend: boolean): KpiCardTrend | null {
  if (!showTrend) return null;
  const delta = pctDelta(current, previous);
  if (delta == null) return null;
  const direction = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  return { direction, label: `${Math.abs(delta).toFixed(0)}% vs prev.` };
}

interface KpiHeroRowProps {
  summary: AnalyticsSummary | null;
  /** False for "All time", where a "previous period" isn't meaningful. */
  showTrend: boolean;
}

/** The 3 primary KPI cards for the selected period: mobile snap-carousel
 *  (peek of next card), desktop 3-up grid — mirrors the exact pattern in
 *  components/settings/rate-limits.tsx. */
export function KpiHeroRow({ summary, showTrend }: KpiHeroRowProps) {
  const original = summary?.original_bytes ?? 0;
  const prevOriginal = summary?.prev_original_bytes ?? 0;
  const encrypted = summary?.encrypted_bytes ?? 0;
  const prevEncrypted = summary?.prev_encrypted_bytes ?? 0;
  const fileCount = summary?.file_count ?? 0;
  const prevFileCount = summary?.prev_file_count ?? 0;
  const spaceSaved = Math.max(0, original - encrypted);
  const prevSpaceSaved = Math.max(0, prevOriginal - prevEncrypted);
  const savingsPct = original > 0 ? ((1 - encrypted / original) * 100).toFixed(1) : "0";

  const cards = [
    {
      key: "storage",
      label: "Storage added",
      value: formatBytes(original),
      icon: HardDrive,
      hint: `${fileCount.toLocaleString()} file${fileCount !== 1 ? "s" : ""}`,
      trend: trendFor(original, prevOriginal, showTrend),
    },
    {
      key: "files",
      label: "Files uploaded",
      value: fileCount.toLocaleString(),
      icon: Layers,
      hint: summary?.chunk_count ? `${summary.chunk_count.toLocaleString()} chunks` : undefined,
      trend: trendFor(fileCount, prevFileCount, showTrend),
    },
    {
      key: "saved",
      label: "Space saved",
      value: formatBytes(spaceSaved),
      icon: TrendingDown,
      hint: `${savingsPct}% compression`,
      trend: trendFor(spaceSaved, prevSpaceSaved, showTrend),
    },
  ];

  return (
    <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible">
      {cards.map((c) => (
        <li key={c.key} className="min-w-[78%] shrink-0 snap-center sm:min-w-0 sm:shrink">
          <KpiCard label={c.label} value={c.value} icon={c.icon} hint={c.hint} trend={c.trend} />
        </li>
      ))}
    </ul>
  );
}
