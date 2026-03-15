import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-4 w-36 mb-1" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
