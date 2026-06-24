"use client";

import { formatBytes } from "@/lib/utils";
import type { FileMetadata } from "@/types";
import { FileText, Image, Video, Archive, File } from "@/lib/icons";

interface StatCardsProps {
  files: FileMetadata[];
}

interface CategoryStat {
  label: string;
  icon: typeof File;
  color: string;
  bg: string;
  extensions: string[];
}

const categories: CategoryStat[] = [
  {
    label: "Documents",
    icon: FileText,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    extensions: ["pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv", "ppt", "pptx"],
  },
  {
    label: "Images",
    icon: Image,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"],
  },
  {
    label: "Videos",
    icon: Video,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"],
  },
  {
    label: "Others",
    icon: Archive,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    extensions: [],
  },
];

export function StatCards({ files }: StatCardsProps) {
  const knownExts = new Set(categories.flatMap((c) => c.extensions));

  const stats = categories.map((cat) => {
    const matched = cat.extensions.length > 0
      ? files.filter((f) => {
          const ext = f.original_name.split(".").pop()?.toLowerCase() || "";
          return cat.extensions.includes(ext);
        })
      : files.filter((f) => {
          const ext = f.original_name.split(".").pop()?.toLowerCase() || "";
          return !knownExts.has(ext);
        });

    const totalSize = matched.reduce((s, f) => s + f.original_size, 0);
    const totalEncrypted = matched.reduce((s, f) => s + f.encrypted_size, 0);
    const savings = totalSize > 0 ? ((1 - totalEncrypted / totalSize) * 100).toFixed(0) : "0";

    return { ...cat, count: matched.length, totalSize, savings };
  });

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="panel p-5 transition-colors hover:border-[var(--color-border-hover)]"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              {stat.count > 0 && (
                <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--color-accent)]">
                  {stat.savings}% saved
                </span>
              )}
            </div>
            <p className="truncate text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {stat.label}
            </p>
            <p className="mt-0.5 truncate text-xl font-semibold tabular-nums tracking-tight text-[var(--color-text)]">
              {formatBytes(stat.totalSize)}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text-secondary)]">
              {stat.count} file{stat.count !== 1 ? "s" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
