import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat, SkeletonRow } from "@/components/ui/skeletons";

export default function AnalyticsLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Page header (PageHeader: eyebrow / title / description + actions) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-7 w-36 rounded-md" />
          <Skeleton className="hidden h-4 w-96 max-w-full rounded-md md:block" />
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 sm:pt-0.5">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Headline metrics — 5 stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Storage hero */}
      <div className="panel p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center">
          <Skeleton className="h-24 w-24 flex-shrink-0 self-center rounded-full sm:self-auto" />
          <div className="min-w-0 flex-1 space-y-4">
            <Skeleton className="h-9 w-44 rounded-md" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Storage by file type — 4 stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Activity + distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Upload activity (spans 2) */}
        <div className="panel overflow-hidden lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-40 rounded-md" />
            </div>
            <Skeleton className="h-8 w-52 self-start rounded-lg sm:self-auto" />
          </div>
          <div className="p-5 pt-4">
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
        </div>

        {/* By file type */}
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <div className="p-5 pt-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-[140px] w-[140px] flex-shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" />
                    <Skeleton className="h-3 flex-1 rounded-md" />
                    <Skeleton className="h-3 w-8 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage growth */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-48 rounded-md" />
          </div>
        </div>
        <div className="p-5 pt-4">
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      </div>

      {/* The details (VaultDetails) — 3 grouped metric columns */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
          {[6, 6, 5].map((rows, c) => (
            <div key={c} className="p-5">
              <Skeleton className="mb-3 h-2.5 w-16 rounded-md" />
              <div className="space-y-3">
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <Skeleton className="h-3.5 w-28 rounded-md" />
                    <Skeleton className="h-3.5 w-14 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Platforms + storage health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, p) => (
          <div key={p} className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="hidden h-3 w-40 rounded-md sm:block" />
            </div>
            <div className="space-y-4 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-28 rounded-md" />
                    <Skeleton className="h-3 w-24 rounded-md" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent uploads */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <div className="px-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} className="border-b border-[var(--color-border)] py-3 last:border-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
