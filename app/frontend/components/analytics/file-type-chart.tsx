"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatBytes } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface FileTypeChartProps {
  files: FileMetadata[];
}

const FILE_CATEGORIES: { label: string; color: string; extensions: string[] }[] = [
  { label: "Documents", color: "#3b82f6", extensions: ["pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv", "ppt", "pptx"] },
  { label: "Images", color: "#f59e0b", extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"] },
  { label: "Videos", color: "#8b5cf6", extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"] },
  { label: "Audio", color: "#ec4899", extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a"] },
  { label: "Archives", color: "#f97316", extensions: ["zip", "rar", "7z", "tar", "gz", "bz2"] },
  { label: "Code", color: "#06b6d4", extensions: ["js", "ts", "py", "go", "rs", "java", "cpp", "c", "html", "css", "json"] },
  { label: "Other", color: "#14b8a6", extensions: [] },
];

export function FileTypeChart({ files }: FileTypeChartProps) {
  const data = useMemo(() => {
    const knownExts = new Set(FILE_CATEGORIES.flatMap((c) => c.extensions));

    return FILE_CATEGORIES.map((cat) => {
      const matched = cat.extensions.length > 0
        ? files.filter((f) => cat.extensions.includes(f.original_name.split(".").pop()?.toLowerCase() || ""))
        : files.filter((f) => !knownExts.has(f.original_name.split(".").pop()?.toLowerCase() || ""));

      return {
        name: cat.label,
        value: matched.reduce((s, f) => s + f.original_size, 0),
        count: matched.length,
        color: cat.color,
      };
    }).filter((d) => d.value > 0);
  }, [files]);

  if (data.length === 0) {
    return (
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">By file type</h3>
        </div>
        <div className="flex h-[200px] items-center justify-center text-sm text-[var(--color-text-muted)]">
          No files yet
        </div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">By file type</h3>
      </div>
      <div className="p-5 pt-4">
        <div className="flex items-center gap-4">
          <div className="w-[140px] h-[140px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    padding: "8px 12px",
                    color: "var(--color-text)",
                    boxShadow: "0 4px 12px -6px rgba(16, 24, 40, 0.16)",
                  }}
                  labelStyle={{ color: "var(--color-text-secondary)" }}
                  formatter={(value) => [formatBytes(Number(value)), "Size"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 space-y-2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-[var(--color-text-secondary)] flex-1">{d.name}</span>
                <span className="text-xs font-medium tabular-nums">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
