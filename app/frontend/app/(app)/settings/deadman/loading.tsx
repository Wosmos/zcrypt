import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat } from "@/components/ui/skeletons";

export default function DeadManSwitchLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Back link */}
      <Skeleton className="h-3.5 w-28 rounded-md" />

      {/* PageHeader: eyebrow + title + description */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-8 w-56 rounded-md" />
        <Skeleton className="h-4 w-full max-w-lg rounded-md" />
      </div>

      {/* Status panel */}
      <div className="panel space-y-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      {/* Configuration form panel */}
      <div className="panel space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-4 w-full max-w-md rounded-md" />
        </div>

        {/* Four labelled fields (email, name, timeout select, message textarea) */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className={i === 3 ? "h-20 w-full rounded-xl" : "h-10 w-full rounded-xl"} />
          </div>
        ))}

        {/* Include-files checkbox row */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>

        {/* Footer buttons */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl sm:w-24" />
        </div>
      </div>
    </div>
  );
}
