import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRow } from "@/components/ui/skeletons";

export default function SettingsLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-28 rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-4 w-80 max-w-full rounded-md" />
      </div>

      {/* Appearance */}
      <div className="panel space-y-6 p-6">
        <Skeleton className="h-4 w-28 rounded-md" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-xl" />
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-5">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      </div>

      {/* Platform connections */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-44 rounded-md" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-3 w-52 max-w-full rounded-md" />
              </div>
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Privacy */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-20 rounded-md" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    </div>
  );
}
