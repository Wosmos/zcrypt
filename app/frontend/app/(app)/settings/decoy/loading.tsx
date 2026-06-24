import { Skeleton } from "@/components/ui/skeleton";

export default function DecoyLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Back link */}
      <Skeleton className="h-4 w-28 rounded-md" />

      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-8 w-56 rounded-md" />
        <Skeleton className="h-4 w-full max-w-md rounded-md" />
      </div>

      {/* Setup / status */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-24 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-36 rounded-md" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* How it works */}
      <div className="panel space-y-3 p-6">
        <Skeleton className="h-4 w-28 rounded-md" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full max-w-sm rounded-md" />
        ))}
      </div>
    </div>
  );
}
