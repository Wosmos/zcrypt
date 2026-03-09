"use client";

import { useMemo } from "react";
import { cn, getFileCategory } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface FileTypeFilterProps {
  files: FileMetadata[];
  activeFilter: string | null;
  onFilter: (category: string | null) => void;
}

const CATEGORY_ORDER = ["Image", "Video", "Audio", "Document", "Spreadsheet", "Code", "Data", "Archive", "Executable", "Font", "File"];

export function FileTypeFilter({ files, activeFilter, onFilter }: FileTypeFilterProps) {
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      const cat = getFileCategory(f.original_name);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return CATEGORY_ORDER
      .filter((cat) => counts.has(cat))
      .map((cat) => ({ name: cat, count: counts.get(cat)! }));
  }, [files]);

  if (categories.length <= 1) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
      <button
        onClick={() => onFilter(null)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap border transition-colors",
          activeFilter === null
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]"
        )}
      >
        All
        <span className="tabular-nums opacity-60">{files.length}</span>
      </button>
      {categories.map((cat) => (
        <button
          key={cat.name}
          onClick={() => onFilter(activeFilter === cat.name ? null : cat.name)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap border transition-colors",
            activeFilter === cat.name
              ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]"
          )}
        >
          {cat.name}
          <span className="tabular-nums opacity-60">{cat.count}</span>
        </button>
      ))}
    </div>
  );
}
