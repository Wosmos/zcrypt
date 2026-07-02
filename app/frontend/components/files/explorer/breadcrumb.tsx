"use client";

import type { Crumb } from "@/store/folders";
import { ChevronRight, Home } from "@/lib/icons";
import { cn, midTrunc } from "@/lib/utils";

interface ExplorerBreadcrumbProps {
  breadcrumb: Crumb[];
  onNavigate: (index: number) => void;
  dragging: boolean;
  overTarget: string | null | undefined;
  acceptsDrag: (destId: string | null) => boolean;
  dropHandlers: (destId: string | null) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

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
      className={cn(
        "flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden",
        // At the vault root the sole crumb is the redundant "My Vault" label —
        // hide it on mobile (you're obviously in your vault). Desktop keeps it,
        // and once you open a folder the full path shows on every width.
        breadcrumb.length <= 1 && "hidden sm:flex"
      )}
    >
      {breadcrumb.map((crumb, i) => {
        const isLast = i === breadcrumb.length - 1;
        const isRoot = i === 0;
        const isDropTarget = dragging && !isLast && acceptsDrag(crumb.id);
        const isOver = isDropTarget && overTarget === crumb.id && overTarget !== undefined;
        return (
          <div key={`${crumb.id ?? "root"}-${i}`} className="flex flex-shrink-0 items-center gap-0.5">
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
                "flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
                isLast
                  ? "cursor-default text-[var(--color-text)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
                isDropTarget && !isOver &&
                  "bg-[var(--color-accent)]/5 text-[var(--color-accent)] outline-dashed outline-1 outline-offset-1 outline-[var(--color-accent)]/50",
                isOver &&
                  "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-2 ring-inset ring-[var(--color-accent)]"
              )}
            >
              {isRoot && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
              {/* Root crumb ("My Vault"): on mobile the home icon alone is the
                  back-to-root target — hide the redundant label. Desktop keeps it. */}
              <span title={crumb.name} className={isRoot ? "hidden sm:inline" : undefined}>
                {crumb.name ? midTrunc(crumb.name, 10, 4) : crumb.name}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
