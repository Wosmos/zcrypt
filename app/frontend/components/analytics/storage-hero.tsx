"use client";

import { formatBytes } from "@/lib/utils";
import type { FileMetadata, RepoInfo } from "@/types";

interface StorageHeroProps {
  files: FileMetadata[];
  repos: RepoInfo[];
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
    code: { label: "Code", color: "#00d5e4", size: 0 },
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

export function StorageHero({ files, repos }: StorageHeroProps) {
  const totalUsed = repos.reduce((s, r) => s + r.used_bytes, 0);
  const totalMax = repos.reduce((s, r) => s + r.max_bytes, 0);
  const usagePercent = totalMax > 0 ? Math.min(100, (totalUsed / totalMax) * 100) : 0;
  const categories = categorizeFiles(files);
  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);

  // SVG ring constants
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (usagePercent / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] p-6"
      style={{
        background: "linear-gradient(135deg, rgba(0,213,228,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(20,184,166,0.08) 100%)",
      }}
    >
      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, rgba(0,213,228,0.4), transparent)" }} />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4), transparent)" }} />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* Ring chart */}
        <div className="relative flex-shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--color-surface-2)" strokeWidth="6" opacity="0.5" />
            <circle
              cx="48" cy="48" r={radius} fill="none"
              stroke="url(#ring-grad)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00d5e4" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">{Math.round(usagePercent)}%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">{formatBytes(totalUsed)}</span>
            <span className="text-sm text-[var(--color-text-muted)]">of {formatBytes(totalMax)} used</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {categories.slice(0, 4).map((cat) => (
              <span
                key={cat.label}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg"
                style={{ backgroundColor: cat.color + "15", color: cat.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.label} {formatBytes(cat.size)}
              </span>
            ))}
          </div>

          {/* Category bar */}
          {totalOriginal > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--color-surface-2)]">
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
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {categories.map((cat) => (
                  <span key={cat.label} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: cat.color }} />
                    {cat.label} ({((cat.size / totalOriginal) * 100).toFixed(0)}%)
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
