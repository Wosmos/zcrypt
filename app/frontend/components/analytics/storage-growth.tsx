"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBytes, localDateKey } from "@/lib/utils";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_CURSOR } from "./chart-theme";
import type { FileMetadata } from "@/types";

/** Cumulative vault size over time — how your encrypted library grew. */
export function StorageGrowth({ files }: { files: FileMetadata[] }) {
  const data = useMemo(() => {
    if (files.length === 0) return [];
    const byDay = new Map<string, number>();
    for (const f of files) {
      const k = localDateKey(new Date(f.created_at));
      byDay.set(k, (byDay.get(k) || 0) + f.original_size);
    }
    const keys = Array.from(byDay.keys()).sort();
    let cumulative = 0;
    return keys.map((k) => {
      cumulative += byDay.get(k) ?? 0;
      return {
        date: new Date(k + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        bytes: cumulative,
      };
    });
  }, [files]);

  const peak = data.length > 0 ? data[data.length - 1].bytes : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Storage growth</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Cumulative vault size &middot; {formatBytes(peak)} total
          </p>
        </div>
      </div>
      <div className="p-5 pt-4">
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-muted)]">
            No uploads yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v) => formatBytes(Number(v))}
              />
              <Tooltip
                cursor={CHART_TOOLTIP_CURSOR}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value) => [formatBytes(Number(value)), "Vault size"]}
              />
              <Area
                type="monotone"
                dataKey="bytes"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#growthGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#8b5cf6", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
