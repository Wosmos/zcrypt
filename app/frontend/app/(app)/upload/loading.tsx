import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>

      {/* Platform selector */}
      <Skeleton className="h-3 w-28" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-xl" />
        ))}
      </div>

      {/* Passphrase */}
      <Skeleton className="h-10 w-full" />

      {/* Upload zone */}
      <Skeleton className="h-48 w-full rounded-2xl" />

      {/* Pipeline info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-3.5 flex items-center gap-3">
            <Skeleton className="h-9 w-9 flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
