"use client";

import type { Crumb } from "@/store/folders";
import { ChevronRight, Home } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ExplorerBreadcrumbProps {
  breadcrumb: Crumb[];
  onNavigate: (index: number) => void;
  /** Whether a drag is in progress (enables crumbs as drop targets). */
  dragging: boolean;
  /** id (null = Root) currently hovered as a drop target; undefined = none. */
  overTarget: string | null | undefined;
  /** Does a crumb accept the current drag? */
  acceptsDrag: (destId: string | null) => boolean;
  /** Drop handlers for a destination crumb. */
  dropHandlers: (destId: string | null) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * The single breadcrumb above the unified listing. Each crumb is clickable
 * (navigate) and — except the current/last crumb — a drop target you can drag
 * files or folders onto to move them there.
 */
export function ExplorerBreadcrumb({
  breadcrumb,
  onNavigate,
  dragging,
  overTarget,
  acceptsDrag,
  dropHandlers,
}: ExplorerBreadcrumbProps) {
  return (
    <nav
      aria-label="Folder path"
      style={{ scrollbarWidth: "none" }}
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      {breadcrumb.map((crumb, i) => {
        const isLast = i === breadcrumb.length - 1;
        const isRoot = i === 0;
        const isDropTarget = dragging && !isLast && acceptsDrag(crumb.id);
        const isOver =
          isDropTarget && overTarget === crumb.id && overTarget !== undefined;
        return (
          <div key={`${crumb.id ?? "root"}-${i}`} className="flex items-center gap-0.5">
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
            )}
            <button
              type="button"
              onClick={() => onNavigate(i)}
              disabled={isLast}
              aria-current={isLast ? "page" : undefined}
              {...(isDropTarget ? dropHandlers(crumb.id) : {})}
              className={cn(
                "flex max-w-[180px] items-center gap-1.5 truncate rounded-lg px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
                isLast
                  ? "cursor-default text-[var(--color-text)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
                isOver &&
                  "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-2 ring-inset ring-[var(--color-accent)]"
              )}
            >
              {isRoot && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
              <span className="truncate">{crumb.name}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
