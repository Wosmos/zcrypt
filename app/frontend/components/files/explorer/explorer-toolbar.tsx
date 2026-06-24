"use client";

import type { ReactNode } from "react";
import type { ViewMode } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import {
  Search,
  LayoutGrid,
  TableProperties,
  CheckSquare,
  Plus,
  X,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ExplorerToolbarProps {
  breadcrumb: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  onNewFolder: () => void;
  newFolderLocked?: boolean;
}

/**
 * The single toolbar row above the listing: breadcrumb on the left; search,
 * view toggle, Select, and New folder on the right. Wraps gracefully on narrow
 * widths (type-filter chips render on their own line below, in the explorer).
 */
export function ExplorerToolbar({
  breadcrumb,
  search,
  onSearchChange,
  view,
  onViewChange,
  selectMode,
  onToggleSelect,
  onNewFolder,
  newFolderLocked,
}: ExplorerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {breadcrumb}

      <div className="flex flex-1 flex-shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        {/* Inline search */}
        <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
          <Input
            type="search"
            placeholder="Search this folder"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            icon={<Search className="h-4 w-4" />}
            className="h-9 pr-8"
            aria-label="Search files in this folder"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div
          role="group"
          aria-label="View mode"
          className="flex flex-shrink-0 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
        >
          {(
            [
              { mode: "list" as const, icon: TableProperties, title: "List view" },
              { mode: "grid" as const, icon: LayoutGrid, title: "Grid view" },
            ]
          ).map(({ mode, icon: Icon, title }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewChange(mode)}
              aria-pressed={view === mode}
              aria-label={title}
              title={title}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
                view === mode
                  ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Select mode toggle */}
        <Button
          variant={selectMode ? "primary" : "secondary"}
          size="sm"
          onClick={onToggleSelect}
          aria-pressed={selectMode}
          className="flex-shrink-0"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Select</span>
        </Button>

        {/* New folder */}
        <IconButton
          icon={Plus}
          label={newFolderLocked ? "Unlock your vault to create folders" : "New folder"}
          variant="secondary"
          onClick={onNewFolder}
          className="flex-shrink-0"
        />
      </div>
    </div>
  );
}
