import { Skeleton } from "@/components/ui/skeleton";

export default function TrashLoading() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* PageHeader: eyebrow + title + description, right-aligned actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-14 rounded-md" />
          <Skeleton className="h-7 w-44 rounded-md" />
          <Skeleton className="hidden h-4 w-96 max-w-full rounded-md md:block" />
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 sm:pt-0.5">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      {/* Deleted-files list: single .panel with divided rows */}
      <div className="panel divide-y divide-[var(--color-border)] overflow-hidden p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            {/* selection checkbox */}
            <Skeleton className="h-4 w-4 flex-shrink-0 rounded" />
            {/* file-type icon chip */}
            <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
            {/* name + meta */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48 max-w-full rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
            {/* inline actions (Preview / Restore / Delete) — sm and up */}
            <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
            {/* kebab — narrow screens */}
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg sm:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
