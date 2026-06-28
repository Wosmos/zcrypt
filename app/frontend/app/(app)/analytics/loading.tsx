import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat, SkeletonRow } from "@/components/ui/skeletons";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-7 w-40 rounded-md" />
          <Skeleton className="h-3.5 w-72 rounded-md" />
        </div>
        <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Storage hero */}
      <div className="panel space-y-5 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <Skeleton className="h-24 w-24 flex-shrink-0 rounded-full" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* File-type stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Activity + distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-7 w-44 rounded-lg" />
          </div>
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
        <div className="panel space-y-4 p-5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-[140px] w-[140px] flex-shrink-0 rounded-full" />
            <div className="flex-1 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-full rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Storage growth */}
      <div className="panel space-y-4 p-5">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-[200px] w-full rounded-xl" />
      </div>

      {/* Detailed metrics */}
      <div className="panel grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, c) => (
          <div key={c} className="space-y-2.5">
            <Skeleton className="h-3 w-16 rounded-md" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3.5 w-12 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Platforms + storage health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, p) => (
          <div key={p} className="panel space-y-4 p-5">
            <Skeleton className="h-4 w-36 rounded-md" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-3 w-20 rounded-md" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Recent uploads */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <div className="px-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} className="border-b border-[var(--color-border)] last:border-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
