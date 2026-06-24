import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A single shimmering text line. `w` overrides the width class (default w-full). */
export function SkeletonText({ className, w = "w-full" }: { className?: string; w?: string }) {
  return <Skeleton className={cn("h-3.5 rounded-md", w, className)} />;
}

/** A table/list row placeholder: a leading square, a title line and a trailing meta line. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-1/5 rounded-md" />
      </div>
      <Skeleton className="h-3 w-16 flex-shrink-0 rounded-md" />
    </div>
  );
}

/** A panel-shaped card placeholder with a header line and stacked body lines. */
export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("panel space-y-4 p-5", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3 rounded-md", i === lines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/** A StatCard-shaped placeholder: icon chip, label line and value line. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn("panel flex items-start gap-4 p-5", className)}>
      <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
    </div>
  );
}
