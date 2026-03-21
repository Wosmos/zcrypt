import { Skeleton } from "@/components/ui/skeleton";

export default function ToolsLoading() {
  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Tab content placeholder */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-5 flex gap-3">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="h-6 w-16 rounded-lg" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
