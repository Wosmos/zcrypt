import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="animate-fade-in">
      <div className="space-y-4">
        {/* OAuth buttons — two side-by-side */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          {/* Divider */}
          <div className="flex items-center justify-center">
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        </div>

        {/* Mode toggle (Password / Magic Link) */}
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-1)]">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="h-8 flex-1 rounded-lg" />
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-12 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-16 rounded-md" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>

          {/* Forgot password link */}
          <div className="flex justify-end">
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>

          {/* Primary button */}
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>

      {/* Bottom sign-up link */}
      <div className="flex justify-center mt-6">
        <Skeleton className="h-4 w-52 rounded-md" />
      </div>
    </div>
  );
}
