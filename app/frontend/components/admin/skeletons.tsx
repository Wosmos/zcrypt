import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat } from "@/components/ui/skeletons";

/**
 * Admin cluster loading skeletons.
 *
 * These render as Next.js `loading.tsx` fallbacks INSIDE the admin layout,
 * which already provides the PageHeader + tab nav and an `animate-fade-in
 * space-y-6` wrapper. So each skeleton mirrors ONLY its page's content root
 * (no page header, no tabs, no extra fade wrapper) to minimize layout shift.
 */

/* ── Overview (app/(app)/admin) ──────────────────────────────────────── */
export function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      {/* System stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>

      {/* Platform tokens */}
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-28 rounded-md" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="hidden h-9 w-9 flex-shrink-0 rounded-xl sm:block" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
              <Skeleton className="h-7 w-16 flex-shrink-0 rounded-full" />
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </section>

      {/* User feedback */}
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] p-4">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Skeleton key={s} className="h-3.5 w-3.5 rounded-sm" />
                ))}
              </div>
              <Skeleton className="hidden h-3 w-20 flex-shrink-0 rounded-md sm:block" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Users table (app/(app)/admin/users) ─────────────────────────────── */
export function UserTableSkeleton() {
  return (
    <section className="panel overflow-hidden">
      <div className="space-y-1.5 border-b border-[var(--color-border)] px-5 py-4">
        <Skeleton className="h-4 w-16 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
              {["w-12", "w-10", "w-10", "w-8", "w-12", "w-12", "w-12", "w-14"].map((w, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className={`h-2.5 ${w} rounded-md`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-5 py-3.5">
                  <Skeleton className="mb-1.5 h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-2.5 w-36 rounded-md" />
                </td>
                <td className="px-4 py-3.5"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-8 w-[7.5rem] rounded-lg" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-8 rounded-md" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-16 rounded-md" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="ml-auto h-3 w-20 rounded-md" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-3 w-20 rounded-md" /></td>
                <td className="px-5 py-3.5">
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

      {/* Mobile card list */}
      <div className="divide-y divide-[var(--color-border)] lg:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-2.5 w-40 rounded-md" />
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-8 w-[6.5rem] rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, c) => (
                <div key={c} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-10 rounded-md" />
                  <Skeleton className="h-3.5 w-12 rounded-md" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-28 rounded-md" />
              <div className="flex flex-shrink-0 items-center gap-1">
                <Skeleton className="h-7 w-16 rounded-lg" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── User detail (app/(app)/admin/users/[id]) ────────────────────────── */
export function UserDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-4 w-4 rounded-md" />
        <Skeleton className="h-4 w-24 rounded-md" />
      </div>

      {/* User header */}
      <section className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 flex-shrink-0 rounded-2xl" />
            <div>
              <Skeleton className="mb-2 h-5 w-32 rounded-md" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-40 rounded-md" />
                <Skeleton className="h-3.5 w-28 rounded-md" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      </section>

      {/* Plan limits + storage usage */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Plan limits */}
        <section className="panel p-6">
          <Skeleton className="mb-4 h-4 w-32 rounded-md" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-[var(--color-border)] py-2 last:border-0"
              >
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3.5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </section>

        {/* Storage usage */}
        <section className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-lg" />
          </div>
          <div className="mb-4 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2.5 w-12 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </section>
      </div>

      {/* Recent activity */}
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
              <div className="flex flex-1 items-center gap-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-28 rounded-md" />
              </div>
              <Skeleton className="h-3 w-12 flex-shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Audit log (app/(app)/admin/audit-logs) ──────────────────────────── */
export function AuditLogSkeleton() {
  return (
    <section className="panel overflow-hidden">
      {/* Header: title + count on the left, pause + filter select on the right */}
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
        </div>
      </div>

      {/* Event rows: icon chip + badge/ip/time row + device/browser line */}
      <div className="divide-y divide-[var(--color-border)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3">
            <Skeleton className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="hidden h-3 w-28 rounded-md sm:block" />
                <Skeleton className="ml-auto hidden h-3 w-12 rounded-md sm:block" />
              </div>
              <Skeleton className="h-2.5 w-44 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Pricing / plan config (app/(app)/admin/pricing) ─────────────────── */
export function PricingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header: title/subtitle + Add plan / Save changes buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-3 w-64 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Collapsed plan rows */}
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-16 rounded-md" />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                  <Skeleton className="h-2.5 w-52 rounded-md" />
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-4 rounded-md" />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
