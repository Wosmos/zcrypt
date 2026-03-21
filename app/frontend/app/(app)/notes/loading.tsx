import { Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      {/* Split panel */}
      <div className="flex gap-4 min-h-[500px]">
        {/* Sidebar — note list */}
        <div className="w-64 space-y-2 hidden md:block">
          <Skeleton className="h-9 w-full rounded-xl" />
          <div className="space-y-1.5 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card p-3 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 card p-5 space-y-4">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-6 w-40 rounded-xl" />
          <Skeleton className="h-full min-h-[300px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
