import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStat } from "@/components/ui/skeletons";

export default function DeadManSwitchLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Back link */}
      <Skeleton className="h-4 w-28 rounded-md" />

      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-8 w-52 rounded-md" />
        <Skeleton className="h-4 w-full max-w-md rounded-md" />
      </div>

      {/* Status */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-20 rounded-md" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>

      {/* Form */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-32 rounded-md" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className={i === 3 ? "h-20 w-full rounded-xl" : "h-10 w-full rounded-xl"} />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
