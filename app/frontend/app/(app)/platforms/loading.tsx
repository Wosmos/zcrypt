import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformsLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56 mt-2" />
      </div>

      {/* Connections */}
      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </section>

      {/* Repo Pool */}
      <section className="space-y-3">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-28 hidden sm:block" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </section>
    </div>
  );
}
