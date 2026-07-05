import { Skeleton } from "@/components/ui/skeleton";

/** Panel section header: title + description lines. */
function SectionHeader({ titleW = "w-32" }: { titleW?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className={`h-4 ${titleW} rounded-md`} />
      <Skeleton className="h-3.5 w-full max-w-md rounded-md" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* PageHeader */}
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24 rounded-md" />
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="hidden h-4 w-full max-w-xl rounded-md md:block" />
      </div>

      {/* Appearance */}
      <div className="panel space-y-6 p-6">
        <SectionHeader titleW="w-28" />

        {/* Theme segmented control */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-14 rounded-md" />
          <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Color theme picker */}
        <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
          <Skeleton className="h-3 w-24 rounded-md" />
          <div className="flex gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-full" />
            ))}
          </div>
        </div>

        {/* Advanced mode toggle */}
        <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-5">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-64 max-w-full rounded-md" />
          </div>
          <Skeleton className="h-6 w-11 flex-shrink-0 rounded-full" />
        </div>
      </div>

      {/* Encryption key */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-32" />
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 px-4 py-3">
          <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-4 w-56 max-w-full rounded-md" />
          </div>
        </div>
      </div>

      {/* Linked accounts */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-36" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
          >
            <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28 rounded-md" />
              <Skeleton className="h-3 w-44 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        ))}
      </div>

      {/* Platform connections */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-44" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40"
            >
              {/* Card header */}
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5">
                <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-3 w-56 max-w-full rounded-md" />
                </div>
              </div>
              {/* Card body: token input + connect button */}
              <div className="space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Skeleton className="h-10 flex-1 rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl sm:w-28" />
                </div>
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Storage pool */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-28" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
              <div className="hidden space-y-1.5 sm:block">
                <Skeleton className="h-3 w-28 rounded-md" />
                <Skeleton className="h-1.5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Rate limits */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Vault backup */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-32" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full rounded-xl sm:w-40" />
          <Skeleton className="h-10 w-full rounded-xl sm:w-40" />
        </div>
      </div>

      {/* Privacy */}
      <div className="panel space-y-4 p-6">
        <SectionHeader titleW="w-20" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
            >
              <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-3 w-48 max-w-full rounded-md" />
              </div>
              <Skeleton className="ml-auto h-4 w-4 flex-shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* How it works — collapsed header bar */}
      <div className="panel flex items-center justify-between px-6 py-4">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-4 rounded-md" />
      </div>
    </div>
  );
}
