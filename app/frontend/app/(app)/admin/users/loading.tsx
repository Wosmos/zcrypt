import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <Skeleton className="h-4 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["User", "Role", "Plan", "Files", "Storage", "Quota", "Joined", "Actions"].map((h) => (
                <th key={h} className="text-left px-5 py-3">
                  <Skeleton className="h-2.5 w-12" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-5 py-3">
                  <Skeleton className="h-3.5 w-24 mb-1" />
                  <Skeleton className="h-2.5 w-36" />
                </td>
                <td className="px-5 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-5 py-3"><Skeleton className="h-6 w-16 rounded-lg" /></td>
                <td className="px-5 py-3 text-right"><Skeleton className="h-3 w-8 ml-auto" /></td>
                <td className="px-5 py-3 text-right"><Skeleton className="h-3 w-16 ml-auto" /></td>
                <td className="px-5 py-3 text-right"><Skeleton className="h-3 w-14 ml-auto" /></td>
                <td className="px-5 py-3"><Skeleton className="h-3 w-20" /></td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Skeleton className="h-7 w-16 rounded-lg" />
                    <Skeleton className="h-7 w-7 rounded-lg" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
