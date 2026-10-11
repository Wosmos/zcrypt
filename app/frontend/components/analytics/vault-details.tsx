"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatBytes, localDateKey } from "@/lib/utils";
import type { AnalyticsSummary, AnalyticsFileTypeItem } from "@/lib/api";

function topExtension(items: AnalyticsFileTypeItem[]): string {
  const counts = new Map<string, number>();
  for (const f of items) {
    const ext = f.original_name.split(".").pop()?.toLowerCase() || "none";
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  let best = "-";
  let max = 0;
  for (const [ext, n] of counts) {
    if (n > max) {
      max = n;
      best = ext;
    }
  }
  return best === "none" ? "-" : `.${best}`;
}

interface Metric {
  label: string;
  value: string;
  hint?: string;
}

interface VaultDetailsProps {
  /** Exact totals for the selected range (see AnalyticsSummary). */
  summary: AnalyticsSummary | null;
  /** Bounded, range-scoped lean items — used only for the metrics that need
   *  per-file granularity (busiest day, most common type, smallest file);
   *  everything else comes from the exact `summary` aggregate. */
  items: AnalyticsFileTypeItem[];
}

/**
 * Dense, real "nitty-gritty" metrics for the selected period. Sourced from
 * the backend aggregate (exact totals/median/avg) plus the bounded lean item
 * list (per-file metrics only a row-level scan can answer) — never a full
 * unbounded file fetch.
 */
export function VaultDetails({ summary, items }: VaultDetailsProps) {
  const t = useTranslations("app.analytics.details");
  const locale = useLocale();
  const groups = useMemo<{ title: string; metrics: Metric[] }[]>(() => {
    if (!summary || summary.file_count === 0) return [];

    const smallest = items.length > 0 ? Math.min(...items.map((f) => f.original_size)) : null;

    let busiestLabel = "-";
    let busiestCount = 0;
    if (items.length > 0) {
      const byDay = new Map<string, number>();
      for (const f of items) {
        const k = localDateKey(new Date(f.created_at));
        byDay.set(k, (byDay.get(k) || 0) + 1);
      }
      let busiestKey = "";
      for (const [k, n] of byDay) {
        if (n > busiestCount) {
          busiestCount = n;
          busiestKey = k;
        }
      }
      if (busiestKey) {
        busiestLabel = new Date(`${busiestKey}T00:00:00`).toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }

    const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    const oldest = summary.oldest_upload ? new Date(summary.oldest_upload) : null;
    const newest = summary.newest_upload ? new Date(summary.newest_upload) : null;
    const spanDays = oldest
      ? Math.max(1, Math.round((Date.now() - oldest.getTime()) / 86_400_000))
      : 1;
    const compressionRatio =
      summary.original_bytes > 0 ? (summary.compressed_bytes / summary.original_bytes) * 100 : 100;

    return [
      {
        title: t("files"),
        metrics: [
          { label: t("totalFiles"), value: summary.file_count.toLocaleString() },
          { label: t("totalChunks"), value: summary.chunk_count.toLocaleString() },
          { label: t("avgChunks"), value: summary.avg_chunks_per_file.toFixed(1) },
          { label: t("commonType"), value: topExtension(items) },
        ],
      },
      {
        title: t("sizes"),
        metrics: [
          {
            label: t("largest"),
            value: summary.largest_file ? formatBytes(summary.largest_file.original_size) : "-",
          },
          { label: t("smallest"), value: smallest != null ? formatBytes(smallest) : "-" },
          {
            label: t("average"),
            value: formatBytes(summary.original_bytes / summary.file_count),
          },
          { label: t("median"), value: formatBytes(summary.median_size) },
          {
            label: t("compressedTo"),
            value: `${compressionRatio.toFixed(0)}%`,
            hint: formatBytes(summary.compressed_bytes),
          },
          { label: t("stored"), value: formatBytes(summary.encrypted_bytes) },
        ],
      },
      {
        title: t("timeline"),
        metrics: [
          {
            label: t("firstInRange"),
            value: oldest ? oldest.toLocaleDateString(locale, dateFmt) : "-",
          },
          {
            label: t("mostRecent"),
            value: newest ? newest.toLocaleDateString(locale, dateFmt) : "-",
          },
          {
            label: t("span"),
            value: t("days", { count: spanDays }),
          },
          { label: t("avgPerDay"), value: (summary.file_count / spanDays).toFixed(1) },
          {
            label: t("busiest"),
            value: busiestLabel,
            hint:
              busiestCount > 0 ? t("fileCount", { count: busiestCount }) : undefined,
          },
        ],
      },
    ];
  }, [summary, items, t, locale]);

  if (groups.length === 0) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          {t("title")}
        </h3>
      </div>
      <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
        {groups.map((g) => (
          <div key={g.title} className="p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              {g.title}
            </p>
            <dl className="space-y-2">
              {g.metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-[var(--color-text-secondary)]">{m.label}</dt>
                  <dd className="text-right">
                    <span className="text-sm font-medium tabular-nums text-[var(--color-text)]">
                      {m.value}
                    </span>
                    {m.hint && (
                      <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
                        {m.hint}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
