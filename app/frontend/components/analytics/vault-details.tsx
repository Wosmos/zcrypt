"use client";

import { useMemo } from "react";
import { formatBytes, localDateKey } from "@/lib/utils";
import type { FileMetadata } from "@/types";


function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function topExtension(files: FileMetadata[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const ext = f.original_name.split(".").pop()?.toLowerCase() || "none";
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  let best = "—";
  let max = 0;
  for (const [ext, n] of counts) {
    if (n > max) {
      max = n;
      best = ext;
    }
  }
  return best === "none" ? "—" : `.${best}`;
}

interface Metric {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Dense, real "nitty-gritty" metrics derived entirely from the loaded file
 * metadata — no estimates. Grouped into Files, Sizes, and Timeline.
 */
export function VaultDetails({ files }: { files: FileMetadata[] }) {
  const groups = useMemo<{ title: string; metrics: Metric[] }[]>(() => {
    if (files.length === 0) return [];

    const sizes = files.map((f) => f.original_size);
    const original = sizes.reduce((s, v) => s + v, 0);
    const compressed = files.reduce((s, f) => s + f.compressed_size, 0);
    const encrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
    const chunks = files.reduce((s, f) => s + f.chunk_count, 0);
    const largest = Math.max(...sizes);
    const smallest = Math.min(...sizes);

    const times = files.map((f) => new Date(f.created_at).getTime());
    const oldest = new Date(Math.min(...times));
    const newest = new Date(Math.max(...times));
    const ageDays = Math.max(1, Math.round((Date.now() - oldest.getTime()) / 86_400_000));

    const now = Date.now();
    const last7 = files.filter((f) => now - new Date(f.created_at).getTime() <= 7 * 86_400_000).length;
    const last30 = files.filter((f) => now - new Date(f.created_at).getTime() <= 30 * 86_400_000).length;

    // Busiest day
    const byDay = new Map<string, number>();
    for (const f of files) {
      const k = localDateKey(new Date(f.created_at));
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
    let busiestKey = "";
    let busiestCount = 0;
    for (const [k, n] of byDay) {
      if (n > busiestCount) {
        busiestCount = n;
        busiestKey = k;
      }
    }
    const busiestLabel = busiestKey
      ? new Date(busiestKey + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

    const compressionRatio = original > 0 ? (compressed / original) * 100 : 100;
    const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

    return [
      {
        title: "Files",
        metrics: [
          { label: "Total files", value: files.length.toLocaleString() },
          { label: "Total chunks", value: chunks.toLocaleString() },
          { label: "Avg chunks / file", value: (chunks / files.length).toFixed(1) },
          { label: "Most common type", value: topExtension(files) },
          { label: "Added last 7 days", value: last7.toLocaleString() },
          { label: "Added last 30 days", value: last30.toLocaleString() },
        ],
      },
      {
        title: "Sizes",
        metrics: [
          { label: "Largest file", value: formatBytes(largest) },
          { label: "Smallest file", value: formatBytes(smallest) },
          { label: "Average file", value: formatBytes(original / files.length) },
          { label: "Median file", value: formatBytes(median(sizes)) },
          { label: "Compressed to", value: `${compressionRatio.toFixed(0)}%`, hint: formatBytes(compressed) },
          { label: "Stored (encrypted)", value: formatBytes(encrypted) },
        ],
      },
      {
        title: "Timeline",
        metrics: [
          { label: "First upload", value: oldest.toLocaleDateString("en-US", dateFmt) },
          { label: "Latest upload", value: newest.toLocaleDateString("en-US", dateFmt) },
          { label: "Vault age", value: `${ageDays.toLocaleString()} day${ageDays !== 1 ? "s" : ""}` },
          { label: "Avg / day", value: (files.length / ageDays).toFixed(1) },
          { label: "Busiest day", value: busiestLabel, hint: `${busiestCount} file${busiestCount !== 1 ? "s" : ""}` },
        ],
      },
    ];
  }, [files]);

  if (groups.length === 0) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">The details</h3>
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
                    <span className="text-sm font-medium tabular-nums text-[var(--color-text)]">{m.value}</span>
                    {m.hint && (
                      <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">{m.hint}</span>
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
