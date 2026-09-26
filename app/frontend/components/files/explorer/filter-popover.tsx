"use client";

import { useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { getFileCategory, cn } from "@/lib/utils";
import { Filter } from "@/lib/icons";
import type { FileMetadata } from "@/types";

export type SizeFacet = "any" | "under1" | "1to10" | "10to100" | "over100";
export type DateFacet = "any" | "today" | "week" | "month" | "year";

export interface EntryFilters {
  types: Set<string>;
  size: SizeFacet;
  date: DateFacet;
}

export const EMPTY_ENTRY_FILTERS: EntryFilters = { types: new Set(), size: "any", date: "any" };

export function hasActiveFilters(f: EntryFilters): boolean {
  return f.types.size > 0 || f.size !== "any" || f.date !== "any";
}

function activeFilterCount(f: EntryFilters): number {
  return f.types.size + (f.size !== "any" ? 1 : 0) + (f.date !== "any" ? 1 : 0);
}

const ONE_MB = 1024 * 1024;

export function matchesSizeFacet(bytes: number, facet: SizeFacet): boolean {
  switch (facet) {
    case "under1":
      return bytes < ONE_MB;
    case "1to10":
      return bytes >= ONE_MB && bytes < 10 * ONE_MB;
    case "10to100":
      return bytes >= 10 * ONE_MB && bytes < 100 * ONE_MB;
    case "over100":
      return bytes >= 100 * ONE_MB;
    default:
      return true;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function matchesDateFacet(createdAt: string, facet: DateFacet, now = Date.now()): boolean {
  if (facet === "any") return true;
  const age = now - new Date(createdAt).getTime();
  switch (facet) {
    case "today":
      return age < DAY_MS;
    case "week":
      return age < 7 * DAY_MS;
    case "month":
      return age < 30 * DAY_MS;
    case "year":
      return age < 365 * DAY_MS;
    default:
      return true;
  }
}

const SIZE_OPTIONS: { value: SizeFacet; label: string }[] = [
  { value: "any", label: "Any size" },
  { value: "under1", label: "Under 1 MB" },
  { value: "1to10", label: "1–10 MB" },
  { value: "10to100", label: "10–100 MB" },
  { value: "over100", label: "Over 100 MB" },
];

const DATE_OPTIONS: { value: DateFacet; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

interface FilterPopoverProps {
  files: FileMetadata[];
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
}

export function FilterPopover({ files, filters, onFiltersChange }: FilterPopoverProps) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) set.add(getFileCategory(f.original_name));
    return Array.from(set).sort();
  }, [files]);

  const count = activeFilterCount(filters);

  const toggleType = (cat: string) => {
    const next = new Set(filters.types);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onFiltersChange({ ...filters, types: next });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter files"
          className={cn(
            "flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
            count > 0
              ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {count > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4">
        {categories.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)]">Type</h4>
            <div className="space-y-1.5">
              {categories.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 text-sm text-[var(--color-text)]"
                >
                  <Checkbox
                    checked={filters.types.has(cat)}
                    onCheckedChange={() => toggleType(cat)}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)]">Size</h4>
          <select
            value={filters.size}
            onChange={(e) => onFiltersChange({ ...filters, size: e.target.value as SizeFacet })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)]">Date</h4>
          <select
            value={filters.date}
            onChange={(e) => onFiltersChange({ ...filters, date: e.target.value as DateFacet })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {count > 0 && (
          <button
            type="button"
            onClick={() => onFiltersChange(EMPTY_ENTRY_FILTERS)}
            className="text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
