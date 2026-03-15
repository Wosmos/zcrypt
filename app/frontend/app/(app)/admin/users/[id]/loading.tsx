import { Skeleton } from "@/components/ui/skeleton";

export default function UserDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Skeleton className="h-4 w-28" />

      {/* User header card */}
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div>
              <Skeleton className="h-5 w-32 mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      </section>

      {/* Plan + Storage cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="card p-6">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--color-border)] last:border-0">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="grid grid-cols-3 gap-4 mb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-2.5 w-12 mb-1" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </section>
      </div>

      {/* Recent activity */}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
