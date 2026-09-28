"use client";

import { formatBytes } from "@/lib/utils";
import { FileText, Server, Download, Layers } from "@/lib/icons";

type IconComponent = typeof FileText;

interface StripItem {
  key: string;
  label: string;
  value: string;
  icon: IconComponent;
}

interface KpiSecondaryStripProps {
  largestFileSize: number | null;
  platformCount: number;
  activeRepos: number;
  /** Lifetime app installs, unrelated to the selected date range — tagged
   *  separately from the other (range-scoped) items via its own label. */
  appDownloads: number | null;
}

/**
 * One compact divided-strip panel for quieter, secondary stats, instead of
 * cramming them into equal-weight standalone cards. A `flex flex-wrap` row
 * degrades gracefully when an item is absent (e.g. appDownloads still
 * loading), unlike the old fixed `grid-cols-6` that left a dead gap.
 */
export function KpiSecondaryStrip({
  largestFileSize,
  platformCount,
  activeRepos,
  appDownloads,
}: KpiSecondaryStripProps) {
  const items: StripItem[] = [];
  if (largestFileSize != null) {
    items.push({
      key: "largest",
      label: "Largest file",
      value: formatBytes(largestFileSize),
      icon: FileText,
    });
  }
  items.push({ key: "platforms", label: "Platforms", value: `${platformCount}`, icon: Server });
  items.push({ key: "repos", label: "Active repos", value: `${activeRepos}`, icon: Layers });
  if (appDownloads != null) {
    items.push({
      key: "downloads",
      label: "App downloads (lifetime)",
      value: appDownloads.toLocaleString(),
      icon: Download,
    });
  }

  return (
    <div className="panel flex flex-wrap divide-x divide-[var(--color-border)] sm:flex-nowrap">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="flex min-w-[45%] flex-1 items-center gap-3 p-4 sm:min-w-0">
            <Icon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--color-text-muted)]">{item.label}</p>
              <p className="truncate text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
