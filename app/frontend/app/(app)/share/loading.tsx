import { Skeleton } from "@/components/ui/skeleton";

export default function ShareLoading() {
  return (
    <div className="animate-fade-in space-y-8">
      {/* PageHeader: eyebrow + title + description */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="hidden h-4 w-[36rem] max-w-full rounded-md md:block" />
        </div>
      </div>

      {/* Send + Pad cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="panel flex flex-col items-start gap-4 p-6">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="w-full space-y-1.5">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-11/12 rounded-md" />
              <Skeleton className="h-3.5 w-3/5 rounded-md" />
            </div>
            <Skeleton className="mt-auto h-3.5 w-32 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
