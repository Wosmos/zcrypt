"use client";

import { useUploadStore } from "@/store/upload";
import { ProgressBar } from "@/components/ui/progress-bar";
import { X, CheckCircle2, AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function UploadQueue() {
  const { queue, removeFromQueue, clearCompleted } = useUploadStore();

  if (queue.length === 0) return null;

  const hasCompleted = queue.some((i) => i.status === "done");
  const activeCount = queue.filter((i) => i.status !== "done" && i.status !== "failed" && i.status !== "queued").length;
  const completedCount = queue.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Upload Queue
          {queue.length > 1 && (
            <span className="ml-2 font-normal">
              {completedCount}/{queue.length} complete{activeCount > 0 ? ` (${activeCount} active)` : ""}
            </span>
          )}
        </h3>
        {hasCompleted && (
          <button
            onClick={clearCompleted}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-medium"
          >
            Clear completed
          </button>
        )}
      </div>

      <div className="space-y-2">
        {queue.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-200",
              item.status === "done"
                ? "bg-cyan-500/5 border-cyan-500/20"
                : item.status === "failed"
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-[var(--color-surface)] border-[var(--color-border)]"
            )}
          >
            <div className="flex-shrink-0">
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-cyan-500" />
              )}
              {item.status === "failed" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              {item.status !== "done" && item.status !== "failed" && (
                <LogoSpinner size={16} speed="fast" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm truncate font-medium">
                {item.file.name}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatBytes(item.file.size)}
              </p>
              {item.status !== "done" &&
                item.status !== "failed" &&
                item.status !== "queued" && (
                  <ProgressBar
                    percent={item.progress}
                    stage={item.stage}
                    bytesProcessed={item.bytesProcessed}
                    totalBytes={item.totalBytes}
                    startedAt={item.startedAt}
                    className="mt-2"
                  />
                )}
              {item.error && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">{item.error}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => removeFromQueue(item.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
