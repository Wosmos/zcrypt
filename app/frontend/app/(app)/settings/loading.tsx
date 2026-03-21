import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>

      {/* Appearance */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-xl" />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        </div>
      </div>

      {/* Platform connect */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="p-5 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-48" />
              </div>
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          ))}
        </div>
      </div>

      {/* Privacy */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="p-5 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-36" />
              </div>
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
