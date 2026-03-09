"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
import { ChevronDown } from "lucide-react";
import type { FileMetadata } from "@/types";

interface UploadChartProps {
  files: FileMetadata[];
}

type Range = "1d" | "7d" | "30d" | "all";

/** Local YYYY-MM-DD key — avoids UTC drift that toISOString() causes */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getChartData(files: FileMetadata[], range: Range) {
  if (files.length === 0) return [];

  const now = new Date();
  let startDate: Date;
  let bucketFormat: (d: Date) => string;

  if (range === "1d") {
    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    bucketFormat = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } else if (range === "7d") {
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

  // For "1d" range, use hourly buckets
  if (range === "1d") {
    const buckets = new Map<number, { date: string; uploads: number; size: number }>();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);

    for (let h = 0; h <= 24; h++) {
      const t = new Date(start.getTime() + h * 60 * 60 * 1000);
      const hour = t.getHours();
      buckets.set(h, { date: bucketFormat(t), uploads: 0, size: 0 });

      for (const f of files) {
        const fd = new Date(f.created_at);
        if (fd >= t && fd < new Date(t.getTime() + 60 * 60 * 1000)) {
          const bucket = buckets.get(h)!;
          bucket.uploads += 1;
          bucket.size += f.original_size;
        }
      }
    }

    return Array.from(buckets.values());
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
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  if (files.some((f) => new Date(f.created_at).getTime() >= dayAgo)) return "1d";
  if (files.some((f) => new Date(f.created_at).getTime() >= weekAgo)) return "7d";
  if (files.some((f) => new Date(f.created_at).getTime() >= monthAgo)) return "30d";
  return "all";
}

const rangeOptions: { value: Range; label: string }[] = [
  { value: "1d", label: "Day" },
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All Time" },
];

export function UploadChart({ files }: UploadChartProps) {
  const [range, setRange] = useState<Range>(() => bestRange(files));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => getChartData(files, range), [files, range]);

  const currentLabel = rangeOptions.find((r) => r.value === range)?.label ?? "Month";

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">Upload Activity</h3>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] transition-colors"
          >
            {currentLabel}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1 animate-fade-in">
              {rangeOptions.map((r) => (
                <button
                  key={r.value}
                  onClick={() => { setRange(r.value); setDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-[12px] font-medium transition-colors ${
                    range === r.value
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
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
