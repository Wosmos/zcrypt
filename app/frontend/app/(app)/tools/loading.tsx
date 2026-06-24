import { Skeleton } from "@/components/ui/skeleton";

export default function ToolsLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-16 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-md" />
        <Skeleton className="h-3.5 w-2/3 max-w-xl rounded-md" />
      </div>

      {/* Tab bar */}
      <div className="flex w-max gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Active panel */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        <Skeleton className="h-3 w-3/4 rounded-md" />
      </div>
    </div>
  );
}
