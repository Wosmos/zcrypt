import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="card p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col items-center mb-6">
        <Skeleton className="h-12 w-12 rounded-xl mb-4" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-11 w-full mt-2" />
      </div>
      <Skeleton className="h-4 w-44 mx-auto mt-6" />
    </div>
  );
}
