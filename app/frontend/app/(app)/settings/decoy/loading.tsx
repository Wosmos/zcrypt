import { Skeleton } from "@/components/ui/skeleton";

export default function DecoyLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Back to settings link */}
      <Skeleton className="h-3.5 w-28 rounded-md" />

      {/* PageHeader: eyebrow + title + description */}
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-7 w-64 rounded-md" />
        <Skeleton className="hidden h-4 w-full max-w-2xl rounded-md md:block" />
      </div>

      {/* Setup / Status panel */}
      <div className="panel space-y-4 p-6">
        {/* Section header: title + status badge */}
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* Intro copy */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-2/3 rounded-md" />
        </div>
        {/* Decoy password field */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        {/* Confirm password field */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-36 rounded-md" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        {/* Submit button */}
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* How it works panel */}
      <div className="panel space-y-4 p-6">
        <Skeleton className="h-4 w-28 rounded-md" />
        <ol className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3">
              <Skeleton className="h-5 w-5 flex-shrink-0 rounded-full" />
              <Skeleton className="h-3 w-full max-w-sm rounded-md" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
