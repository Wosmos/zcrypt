"use client";

import { useUploadStore } from "@/store/upload";
import { ProgressBar } from "@/components/ui/progress-bar";
import { X, CheckCircle2, AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { pauseUpload, resumeUpload } from "@/lib/api";
import { toast } from "@/store/toast";

export function UploadQueue() {
  const { queue, removeFromQueue, clearCompleted, updateStatus, setError } = useUploadStore();

  if (queue.length === 0) return null;

  const hasCompleted = queue.some((i) => i.status === "done");
  const activeCount = queue.filter((i) => i.status !== "done" && i.status !== "failed" && i.status !== "queued" && i.status !== "paused").length;
  const completedCount = queue.filter((i) => i.status === "done").length;

  const handlePause = async (fileId: string, itemId: string) => {
    try {
      await pauseUpload(fileId);
      updateStatus(itemId, "paused", undefined, "Paused");
      toast.info("Upload paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    }
  };

  const handleResume = async (fileId: string, itemId: string) => {
    try {
      const res = await resumeUpload(fileId);
      updateStatus(itemId, "uploading", undefined, `Resuming (${res.remaining_chunks} chunks left)`);
      toast.info("Upload resumed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resume";
      setError(itemId, msg);
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
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
            className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-medium"
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
                ? "bg-emerald-500/5 border-emerald-500/20"
                : item.status === "failed"
                  ? "bg-red-500/5 border-red-500/20"
                  : item.status === "paused"
                    ? "bg-amber-500/5 border-amber-500/20"
                    : "bg-[var(--color-surface)] border-[var(--color-border)]"
            )}
          >
            <div className="flex-shrink-0">
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {item.status === "failed" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              {item.status === "paused" && (
                <Pause className="h-4 w-4 text-amber-500" />
              )}
              {item.status !== "done" && item.status !== "failed" && item.status !== "paused" && (
                <Loader2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 animate-spin" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm truncate font-medium">
                {item.file.name}
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {formatBytes(item.file.size)}
              </p>
              {item.status !== "done" &&
                item.status !== "failed" &&
                item.status !== "queued" &&
                item.status !== "paused" && (
                  <ProgressBar
                    percent={item.progress}
                    stage={item.stage}
                    bytesProcessed={item.bytesProcessed}
                    totalBytes={item.totalBytes}
                    startedAt={item.startedAt}
                    className="mt-2"
                  />
                )}
              {item.status === "paused" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{item.stage}</p>
              )}
              {item.error && (
                <p className="text-[11px] text-red-500 dark:text-red-400 mt-1">{item.error}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Pause button — shown for active uploads with a backend fileId */}
              {item.fileId && item.status !== "done" && item.status !== "failed" && item.status !== "paused" && item.status !== "queued" && item.status !== "sending" && (
                <button
                  onClick={() => handlePause(item.fileId!, item.id)}
                  className="text-[var(--color-text-muted)] hover:text-amber-500 transition-colors p-1 rounded-lg hover:bg-amber-500/10"
                  title="Pause upload"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Resume button — shown for paused uploads */}
              {item.fileId && item.status === "paused" && (
                <button
                  onClick={() => handleResume(item.fileId!, item.id)}
                  className="text-[var(--color-text-muted)] hover:text-emerald-500 transition-colors p-1 rounded-lg hover:bg-emerald-500/10"
                  title="Resume upload"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              )}

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
