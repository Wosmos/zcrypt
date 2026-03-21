import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-6 w-32" />
        </div>
      </div>

      {/* Upload area */}
      <Skeleton className="h-40 w-full rounded-2xl" />

      {/* File table header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* File rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-4">
            <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="h-3 w-16 hidden sm:block" />
            <Skeleton className="h-3 w-20 hidden sm:block" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
