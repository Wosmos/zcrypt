import { Skeleton } from "@/components/ui/skeleton";

export default function FilesLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-36 mt-1" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      {/* Search + Passphrase */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>

      {/* File list */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-4">
            <Skeleton className="h-10 w-10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-8 w-8 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
