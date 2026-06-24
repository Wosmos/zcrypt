"use client";

import { formatBytes } from "@/lib/utils";
import { Infinity } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import type { FileMetadata, QuotaInfo } from "@/types";

interface StorageHeroProps {
  files: FileMetadata[];
  quotaInfo?: QuotaInfo | null;
}

interface CategoryInfo {
  label: string;
  color: string;
  size: number;
}

function categorizeFiles(files: FileMetadata[]): CategoryInfo[] {
  const cats: Record<string, CategoryInfo> = {
    documents: { label: "Docs", color: "#3b82f6", size: 0 },
    images: { label: "Images", color: "#f59e0b", size: 0 },
    videos: { label: "Videos", color: "#8b5cf6", size: 0 },
    audio: { label: "Audio", color: "#ec4899", size: 0 },
    archives: { label: "Archives", color: "#f97316", size: 0 },
    code: { label: "Code", color: "#06b6d4", size: 0 },
    other: { label: "Other", color: "#14b8a6", size: 0 },
  };

  const extMap: Record<string, string> = {
    pdf: "documents", doc: "documents", docx: "documents", txt: "documents", rtf: "documents", odt: "documents",
    xls: "documents", xlsx: "documents", csv: "documents", ppt: "documents", pptx: "documents",
    jpg: "images", jpeg: "images", png: "images", gif: "images", webp: "images", svg: "images", bmp: "images", ico: "images",
    mp4: "videos", mov: "videos", avi: "videos", mkv: "videos", webm: "videos", flv: "videos",
    mp3: "audio", wav: "audio", flac: "audio", aac: "audio", ogg: "audio", m4a: "audio",
    zip: "archives", rar: "archives", "7z": "archives", tar: "archives", gz: "archives", bz2: "archives",
    js: "code", ts: "code", py: "code", go: "code", rs: "code", java: "code", cpp: "code", c: "code",
    html: "code", css: "code", json: "code", yaml: "code", yml: "code", xml: "code", sh: "code",
  };

  for (const f of files) {
    const ext = f.original_name.split(".").pop()?.toLowerCase() || "";
    const cat = extMap[ext] || "other";
    cats[cat].size += f.original_size;
  }

  return Object.values(cats).filter((c) => c.size > 0);
}

export function StorageHero({ files, quotaInfo }: StorageHeroProps) {
  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  // Storage is unbounded (bounded only by the connected platform) — show usage
  // as a total, never a fraction of a cap.
  const totalUsed = quotaInfo?.used_bytes ?? totalOriginal;
  const categories = categorizeFiles(files);

  return (
    <div className="panel p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Your storage</h2>
        <Badge variant="secondary" className="gap-1 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <Infinity className="h-3 w-3" />
          Unlimited
        </Badge>
      </div>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Usage ring */}
        <div className="relative flex-shrink-0 self-center sm:self-auto">
          <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90" aria-hidden>
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="none"
              stroke="var(--color-surface-2)"
              strokeWidth="6"
            />
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="200 240"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Infinity className="h-7 w-7 text-[var(--color-accent)]" />
          </div>
        </div>

        {/* Totals + distribution */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums text-[var(--color-text)]">
              {formatBytes(totalUsed)}
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">used</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Bounded only by your connected platform
          </p>

          {/* Distribution bar */}
          {totalOriginal > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                {categories.map((cat) => (
                  <div
                    key={cat.label}
                    className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(cat.size / totalOriginal) * 100}%`,
                      backgroundColor: cat.color,
                      minWidth: cat.size > 0 ? "4px" : "0",
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat.label}
                    className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]"
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                    {cat.label}
                    <span className="tabular-nums text-[var(--color-text-muted)]">
                      {((cat.size / totalOriginal) * 100).toFixed(0)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
