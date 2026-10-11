import { Skeleton } from "@/components/ui/skeleton";
import { gridTemplateColumns, type GridCols, type ViewMode } from "./types";

const TILE_COUNT = 12;
const ROW_COUNT = 8;

function SkeletonCard() {
  return (
    <div className="flex flex-col items-center gap-1.5 p-1.5">
      <div className="flex h-[104px] w-full items-end justify-center sm:h-[92px]">
        <Skeleton className="h-[82px] w-[110px] rounded-[10px] sm:h-[74px] sm:w-[98px]" />
      </div>
      <Skeleton className="h-3 w-4/5 rounded-md" />
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 last:border-0">
      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
      <Skeleton className="h-3.5 flex-1 rounded-md" />
      <Skeleton className="hidden h-3 w-[110px] flex-shrink-0 rounded-md sm:block" />
      <Skeleton className="hidden h-3 w-[80px] flex-shrink-0 rounded-md sm:block" />
      <Skeleton className="hidden h-3 w-[110px] flex-shrink-0 rounded-md sm:block" />
      <span className="hidden w-4 flex-shrink-0 sm:block" />
    </div>
  );
}

export function ExplorerSkeleton({
  view,
  gridCols,
  isMobile,
}: {
  view: ViewMode;
  gridCols: GridCols;
  isMobile: boolean;
}) {
  if (view === "list") {
    return (
      <div aria-hidden className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="hidden h-[41px] border-b border-[var(--color-border)] bg-[var(--color-surface-1)] sm:block" />
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="grid gap-1.5 sm:gap-2.5"
      style={{ gridTemplateColumns: gridTemplateColumns(gridCols, isMobile) }}
    >
      {Array.from({ length: TILE_COUNT }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
