"use client";

import { useMemo } from "react";
import {
  Image,
  VideoCamera,
  MusicNotes,
  FileText,
  Table,
  Code,
  Database,
  Archive,
  Terminal,
  TextAa,
  File,
  SquaresFour,
  type Icon,
} from "@phosphor-icons/react";
import { cn, getFileCategory } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface FileTypeFilterProps {
  files: FileMetadata[];
  activeFilter: string | null;
  onFilter: (category: string | null) => void;
  /** Icon-only chips (mobile) — the category name becomes the aria-label/tooltip
   *  instead of visible text, so the row stays compact next to the actions. */
  compact?: boolean;
}

const CATEGORY_ORDER = ["Image", "Video", "Audio", "Document", "Spreadsheet", "Code", "Data", "Archive", "Executable", "Font", "File"];

// One recognizable Phosphor glyph per file category (pdf/docs → Document,
// html/js → Code, zip → Archive, and so on).
const CATEGORY_ICON: Record<string, Icon> = {
  Image,
  Video: VideoCamera,
  Audio: MusicNotes,
  Document: FileText,
  Spreadsheet: Table,
  Code,
  Data: Database,
  Archive,
  Executable: Terminal,
  Font: TextAa,
  File,
};

export function FileTypeFilter({ files, activeFilter, onFilter, compact = false }: FileTypeFilterProps) {
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
      "flex items-center gap-1.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
      compact ? "px-2.5" : "px-3",
      active
        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
        : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
    );

  const allActive = activeFilter === null;

  return (
    <div
      style={{ scrollbarWidth: "none" }}
      className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden -mx-1 px-1"
    >
      <button
        type="button"
        onClick={() => onFilter(null)}
        aria-pressed={allActive}
        aria-label={compact ? "All files" : undefined}
        title={compact ? "All files" : undefined}
        className={chipClass(allActive)}
      >
        {compact ? (
          <SquaresFour size={16} weight={allActive ? "fill" : "regular"} />
        ) : (
          "All"
        )}
        <span className="tabular-nums opacity-80">{files.length}</span>
      </button>
      {categories.map((cat) => {
        const active = activeFilter === cat.name;
        const CatIcon = CATEGORY_ICON[cat.name] ?? File;
        return (
          <button
            type="button"
            key={cat.name}
            onClick={() => onFilter(active ? null : cat.name)}
            aria-pressed={active}
            aria-label={compact ? cat.name : undefined}
            title={compact ? cat.name : undefined}
            className={chipClass(active)}
          >
            {compact ? (
              <CatIcon size={16} weight={active ? "fill" : "regular"} />
            ) : (
              cat.name
            )}
            <span className="tabular-nums opacity-80">{cat.count}</span>
          </button>
        );
      })}
    </div>
  );
}
