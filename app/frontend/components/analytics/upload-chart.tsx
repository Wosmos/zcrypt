"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBytes } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface UploadChartProps {
  files: FileMetadata[];
}

type Range = "7d" | "30d" | "all";

/** Local YYYY-MM-DD key — avoids UTC drift that toISOString() causes */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getChartData(files: FileMetadata[], range: Range) {
  if (files.length === 0) return [];

  const now = new Date();
  let startDate: Date;
  let bucketFormat: (d: Date) => string;

  if (range === "7d") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    bucketFormat = (d) => d.toLocaleDateString("en-US", { weekday: "short" });
  } else if (range === "30d") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    bucketFormat = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else {
    const dates = files.map((f) => new Date(f.created_at).getTime());
    startDate = new Date(Math.min(...dates));
    bucketFormat = (d) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }

  // Build daily buckets using local date keys
  const bucketKeys: string[] = [];
  const buckets = new Map<string, { date: string; uploads: number; size: number }>();

  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  while (d <= now) {
    const key = localDateKey(d);
    bucketKeys.push(key);
    buckets.set(key, { date: bucketFormat(new Date(d)), uploads: 0, size: 0 });
    d.setDate(d.getDate() + 1);
  }

  // Fill in file data using local date keys
  for (const f of files) {
    const fd = new Date(f.created_at);
    if (fd < startDate) continue;
    const key = localDateKey(fd);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.uploads += 1;
      bucket.size += f.original_size;
    }
  }

  const entries = Array.from(buckets.values());

  // For "all" range with many entries, aggregate by month
  if (range === "all" && entries.length > 60) {
    const monthly = new Map<string, { date: string; uploads: number; size: number }>();
    for (let i = 0; i < entries.length; i++) {
      const monthKey = bucketKeys[i].substring(0, 7);
      if (!monthly.has(monthKey)) {
        monthly.set(monthKey, { date: entries[i].date, uploads: 0, size: 0 });
      }
      const m = monthly.get(monthKey)!;
      m.uploads += entries[i].uploads;
      m.size += entries[i].size;
    }
    return Array.from(monthly.values());
  }

  // For 30d, sample every 2nd day if too many
  if (range === "30d" && entries.length > 15) {
    return entries.filter((_, i) => i % 2 === 0 || i === entries.length - 1);
  }

  return entries;
}

/** Pick the best range that actually has upload data */
function bestRange(files: FileMetadata[]): Range {
  if (files.length === 0) return "30d";
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  if (files.some((f) => new Date(f.created_at).getTime() >= weekAgo)) return "7d";
  if (files.some((f) => new Date(f.created_at).getTime() >= monthAgo)) return "30d";
  return "all";
}

export function UploadChart({ files }: UploadChartProps) {
  const [range, setRange] = useState<Range>(() => bestRange(files));
  const data = useMemo(() => getChartData(files, range), [files, range]);

  const ranges: { value: Range; label: string }[] = [
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">Upload Activity</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                range === r.value
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 pt-4">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-sm text-[var(--color-text-muted)]">
            No upload data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  padding: "8px 12px",
                }}
                formatter={(value, name) => {
                  if (name === "size") return [formatBytes(Number(value)), "Size"];
                  return [value, "Uploads"];
                }}
              />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#uploadGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#10b981", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
