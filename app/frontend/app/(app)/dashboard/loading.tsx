import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the vault page. Mirrors the real silhouette: the top search +
 * actions row, then <VaultExplorer/>'s toolbar (breadcrumb + view/select), the
 * type-filter chip line, and the default GRID listing (matches the explorer's
 * own 8-card loading grid). Sidebar / global chrome live in the (app) shell.
 */
export default function VaultLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top row — search on the left (with the vault-lock pill hugging it on
          desktop), [New folder, Upload, refresh] far right. */}
      <div className="flex flex-row items-center gap-2 sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
          <Skeleton className="h-9 w-full min-w-0 flex-1 rounded-xl sm:w-80" />
          <Skeleton className="hidden h-9 w-28 flex-shrink-0 rounded-lg sm:block" />
        </div>
        <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Explorer */}
      <div className="space-y-3">
        {/* Toolbar — breadcrumb (left) + grid density / view toggle / Select (right, desktop) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
          <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>

        {/* Type-filter chips (desktop) */}
        <div className="hidden flex-wrap gap-2 sm:flex">
          {["w-16", "w-20", "w-14", "w-24", "w-16"].map((w, i) => (
            <Skeleton key={i} className={`h-7 ${w} rounded-full`} />
          ))}
        </div>

        {/* Listing — default GRID view (mirrors the explorer's own loading grid) */}
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))" }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
