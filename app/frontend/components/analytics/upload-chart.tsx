"use client";

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
import {
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_CURSOR,
} from "./chart-theme";
import type { AnalyticsTimeseriesPoint } from "@/lib/api";
import type { Bucket } from "./date-range";

interface UploadChartProps {
  points: AnalyticsTimeseriesPoint[];
  bucket: Bucket;
  isLoading?: boolean;
}

function formatBucketLabel(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === "hour") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (bucket === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Upload activity, server-bucketed (see GetUploadTimeseries in
 * app/backend/index/analytics_queries.go): the page-wide date-range control
 * now drives what this shows, so it no longer owns its own range toggle or
 * does any client-side bucketing/sampling.
 */
export function UploadChart({ points, bucket, isLoading }: UploadChartProps) {
  const data = points.map((p) => ({
    date: formatBucketLabel(p.bucket, bucket),
    uploads: p.uploads,
    size: p.bytes,
  }));
  const totalUploads = data.reduce((s, d) => s + d.uploads, 0);
  const totalSize = data.reduce((s, d) => s + d.size, 0);

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          Upload activity
        </h3>
        <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text-muted)]">
          {totalUploads.toLocaleString()} upload{totalUploads !== 1 ? "s" : ""} &middot;{" "}
          {formatBytes(totalSize)} in range
        </p>
      </div>
      <div className="p-5 pt-4">
        {isLoading || data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-muted)]">
            {isLoading ? "Loading…" : "No upload data yet"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
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
                cursor={CHART_TOOLTIP_CURSOR}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value, name) => {
                  if (name === "size") return [formatBytes(Number(value)), "Size"];
                  return [value, "Uploads"];
                }}
              />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="url(#uploadGrad)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-accent)",
                  stroke: "var(--color-surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
