import { Skeleton } from "@/components/ui/skeleton";

// 7 tabs — widths roughly track the real labels (Send File, Text Pad,
// Transfer, Snapshots, Integrity, Expiring, Devices).
const TAB_WIDTHS = ["w-24", "w-24", "w-24", "w-28", "w-24", "w-24", "w-24"];

export default function ToolsLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* PageHeader: eyebrow + title + description */}
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="hidden h-4 w-2/3 max-w-2xl rounded-md md:block" />
      </div>

      {/* Tab bar */}
      <div className="inline-flex h-auto w-max max-w-full gap-1 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-1">
        {TAB_WIDTHS.map((w, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${w}`}
          >
            <Skeleton className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" />
            <Skeleton className="h-3.5 flex-1 rounded-md" />
          </div>
        ))}
      </div>

      {/* Active panel — default "Send File" tab: an upload dropzone */}
      <div className="panel overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-border)] p-10 sm:p-14">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-4 w-56 rounded-md" />
              <Skeleton className="h-3 w-64 max-w-xs rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
