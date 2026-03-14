"use client";

import { useMemo } from "react";
import {
  Image, Video, Music, FileText, Archive, Code, Cog, File, Table,
  Shield, Lock, Unlock,
} from "@/lib/icons";
import { formatBytes, getFileCategory } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { FileMetadata, QuotaInfo, RepoInfo } from "@/types";

interface MobileVaultHeaderProps {
  files: FileMetadata[];
  quotaInfo: QuotaInfo | null;
  repos: RepoInfo[];
  isUnlocked: boolean;
  onUnlock: () => void;
  onCategoryClick: (category: string | null) => void;
  activeCategory: string | null;
}

const CATEGORY_CONFIG: { name: string; icon: typeof File; color: string; bgFrom: string; bgTo: string }[] = [
  { name: "Image", icon: Image, color: "text-violet-600 dark:text-violet-400", bgFrom: "from-violet-100 dark:from-violet-500/15", bgTo: "to-violet-50 dark:to-violet-500/5" },
  { name: "Video", icon: Video, color: "text-blue-600 dark:text-blue-400", bgFrom: "from-blue-100 dark:from-blue-500/15", bgTo: "to-blue-50 dark:to-blue-500/5" },
  { name: "Audio", icon: Music, color: "text-pink-600 dark:text-pink-400", bgFrom: "from-pink-100 dark:from-pink-500/15", bgTo: "to-pink-50 dark:to-pink-500/5" },
  { name: "Document", icon: FileText, color: "text-rose-600 dark:text-rose-400", bgFrom: "from-rose-100 dark:from-rose-500/15", bgTo: "to-rose-50 dark:to-rose-500/5" },
  { name: "Spreadsheet", icon: Table, color: "text-cyan-600 dark:text-cyan-400", bgFrom: "from-cyan-100 dark:from-cyan-500/15", bgTo: "to-cyan-50 dark:to-cyan-500/5" },
  { name: "Code", icon: Code, color: "text-yellow-600 dark:text-yellow-400", bgFrom: "from-yellow-100 dark:from-yellow-500/15", bgTo: "to-yellow-50 dark:to-yellow-500/5" },
  { name: "Archive", icon: Archive, color: "text-amber-600 dark:text-amber-400", bgFrom: "from-amber-100 dark:from-amber-500/15", bgTo: "to-amber-50 dark:to-amber-500/5" },
  { name: "Executable", icon: Cog, color: "text-orange-600 dark:text-orange-400", bgFrom: "from-orange-100 dark:from-orange-500/15", bgTo: "to-orange-50 dark:to-orange-500/5" },
];

export function MobileVaultHeader({ files, quotaInfo, repos, isUnlocked, onUnlock, onCategoryClick, activeCategory }: MobileVaultHeaderProps) {
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, { count: number; size: number }>();
    for (const f of files) {
      const cat = getFileCategory(f.original_name);
      const existing = counts.get(cat) || { count: 0, size: 0 };
      counts.set(cat, { count: existing.count + 1, size: existing.size + f.original_size });
    }
    return counts;
  }, [files]);

  const totalUsed = repos.reduce((s, r) => s + r.used_bytes, 0);
  const totalMax = repos.reduce((s, r) => s + r.max_bytes, 0);
  const quotaUsed = quotaInfo?.used_bytes ?? totalUsed;
  const quotaMax = quotaInfo && !quotaInfo.is_unlimited ? quotaInfo.quota_bytes : totalMax;
  const percent = quotaMax > 0 ? Math.min((quotaUsed / quotaMax) * 100, 100) : 0;

  const activeCategories = CATEGORY_CONFIG.filter((c) => categoryCounts.has(c.name));
  // Add "File" catch-all if there are uncategorized files
  const otherCount = categoryCounts.get("File") || categoryCounts.get("Data") || categoryCounts.get("Font");

  return (
    <div className="md:hidden space-y-4">
      {/* Storage card */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-cyan-600 dark:to-cyan-700 p-4 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-white/80" />
              <span className="text-sm font-semibold text-white/90">Encrypted Vault</span>
            </div>
            <button
              onClick={onUnlock}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                isUnlocked
                  ? "bg-white/20 text-white"
                  : "bg-white/25 text-white active:bg-white/30"
              )}
            >
              {isUnlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {isUnlocked ? "Unlocked" : "Unlock"}
            </button>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {formatBytes(quotaUsed)}
            <span className="text-sm font-normal text-white/60 ml-1">
              / {quotaMax > 0 ? formatBytes(quotaMax) : "Unlimited"}
            </span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/80 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-white/60">
            <span>{files.length} file{files.length !== 1 ? "s" : ""}</span>
            <span>{percent.toFixed(0)}% used</span>
          </div>
        </div>
      </div>

      {/* Category grid */}
      {activeCategories.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Categories</h3>
            {activeCategory && (
              <button
                onClick={() => onCategoryClick(null)}
                className="text-xs font-medium text-[var(--color-accent)]"
              >
                Show All
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {activeCategories.map((cat) => {
              const data = categoryCounts.get(cat.name)!;
              const CatIcon = cat.icon;
              const isActive = activeCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => onCategoryClick(isActive ? null : cat.name)}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150 active:scale-[0.97]",
                    isActive
                      ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]/15"
                      : `border-[var(--color-border)] bg-gradient-to-br ${cat.bgFrom} ${cat.bgTo}`
                  )}
                >
                  <div className={cn("flex items-center justify-center h-9 w-9 rounded-xl bg-white/80 dark:bg-white/10 flex-shrink-0", isActive && "bg-[var(--color-accent)]/10")}>
                    <CatIcon className={cn("h-5 w-5", isActive ? "text-[var(--color-accent)]" : cat.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{cat.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{data.count} file{data.count !== 1 ? "s" : ""}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{formatBytes(data.size)}</p>
                  </div>
                </button>
              );
            })}
            {otherCount && !activeCategories.some((c) => c.name === "File") && (
              <button
                onClick={() => onCategoryClick(activeCategory === "File" ? null : "File")}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150 active:scale-[0.97]",
                  activeCategory === "File"
                    ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5"
                    : "border-[var(--color-border)] bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-500/15 dark:to-gray-500/5"
                )}
              >
                <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/80 dark:bg-white/10 flex-shrink-0">
                  <File className="h-5 w-5 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Other</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{otherCount.count} file{otherCount.count !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{formatBytes(otherCount.size)}</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
