import { Skeleton } from "@/components/ui/skeleton";

export default function DeadManSwitchLoading() {
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      {/* Back link */}
      <Skeleton className="h-4 w-28" />

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-6 w-44" />
        </div>
      </div>

      {/* Status card */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      {/* Form */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
