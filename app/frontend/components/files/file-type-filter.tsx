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

  const chipClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
      active
        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
        : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
    );

  return (
    <div
      style={{ scrollbarWidth: "none" }}
      className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden -mx-1 px-1"
    >
      <button
        type="button"
        onClick={() => onFilter(null)}
        aria-pressed={activeFilter === null}
        className={chipClass(activeFilter === null)}
      >
        All
        <span className="tabular-nums opacity-80">{files.length}</span>
      </button>
      {categories.map((cat) => {
        const active = activeFilter === cat.name;
        return (
          <button
            type="button"
            key={cat.name}
            onClick={() => onFilter(active ? null : cat.name)}
            aria-pressed={active}
            className={chipClass(active)}
          >
            {cat.name}
            <span className="tabular-nums opacity-80">{cat.count}</span>
          </button>
        );
      })}
    </div>
  );
}
