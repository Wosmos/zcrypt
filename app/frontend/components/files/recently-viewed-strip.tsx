"use client";

import { useMemo } from "react";
import { useRecentlyViewedStore } from "@/store/recently-viewed";
import { fileIconFor, formatBytes } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface RecentlyViewedStripProps {
  files: FileMetadata[];
  onOpen: (file: FileMetadata, folderFiles: FileMetadata[]) => void;
}

const MIN_ENTRIES_TO_SHOW = 2;

export function RecentlyViewedStrip({ files, onOpen }: RecentlyViewedStripProps) {
  const entries = useRecentlyViewedStore((s) => s.entries);

  const recentFiles = useMemo(() => {
    const byId = new Map(files.map((f) => [f.id, f]));
    return entries.map((e) => byId.get(e.fileId)).filter((f): f is FileMetadata => !!f);
  }, [entries, files]);

  if (recentFiles.length < MIN_ENTRIES_TO_SHOW) return null;

  return (
    <div className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Recently viewed
      </h3>
      <div
        style={{ scrollbarWidth: "none" }}
        className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
      >
        {recentFiles.map((file) => {
          const Icon = fileIconFor(file.original_name);
          const folderFiles = files.filter(
            (f) => (f.folder_id ?? null) === (file.folder_id ?? null),
          );
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => onOpen(file, folderFiles)}
              className="flex min-w-[10rem] max-w-[10rem] flex-shrink-0 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)]">
                <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-[var(--color-text)]">
                  {file.original_name}
                </span>
                <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                  {formatBytes(file.original_size)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
