import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat, SkeletonRow } from "@/components/ui/skeletons";

export function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Token management */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] p-4">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        </div>
        <div className="divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function UserTableSkeleton() {
  return (
    <section className="panel overflow-hidden">
      <div className="space-y-1.5 border-b border-[var(--color-border)] px-5 py-4">
        <Skeleton className="h-4 w-16 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
              {["w-12", "w-10", "w-10", "w-8", "w-12", "w-10", "w-12", "w-14"].map((w, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className={`h-2.5 ${w} rounded-md`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3.5">
                  <Skeleton className="mb-1 h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-2.5 w-36 rounded-md" />
                </td>
                <td className="px-4 py-3.5"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-6 w-16 rounded-lg" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-8 rounded-md" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-16 rounded-md" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-14 rounded-md" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-3 w-20 rounded-md" /></td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Skeleton className="h-7 w-16 rounded-lg" />
                    <Skeleton className="h-7 w-7 rounded-lg" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function UserDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28 rounded-md" />
      <section className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div>
              <Skeleton className="mb-2 h-5 w-32 rounded-md" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-40 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="panel p-6">
          <Skeleton className="mb-4 h-4 w-32 rounded-md" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-[var(--color-border)] py-2 last:border-0">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3.5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-6">
          <Skeleton className="mb-4 h-4 w-28 rounded-md" />
          <div className="mb-4 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1 h-2.5 w-12 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </section>
      </div>
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
        <div className="divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function AuditLogSkeleton() {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-40 rounded-md" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="divide-y divide-[var(--color-border)] px-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </section>
  );
}

export function PricingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-3 w-64 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="panel overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Skeleton className="h-3.5 w-16 rounded-md" />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                  <Skeleton className="h-2.5 w-48 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-3 w-10 rounded-md" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
