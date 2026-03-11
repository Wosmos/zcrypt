"use client";

import { useDownloadStore } from "@/store/download";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  StopCircle,
  Download,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function DownloadQueue() {
  const { queue, cancelDownload, removeFromQueue, clearCompleted } =
    useDownloadStore();

  if (queue.length === 0) return null;

  const hasCompleted = queue.some(
    (i) => i.status === "done" || i.status === "cancelled"
  );
  const activeCount = queue.filter((i) => i.status === "downloading").length;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Downloads
          {queue.length > 1 && (
            <span className="ml-2 font-normal">
              {activeCount} active
            </span>
          )}
        </h3>
        {hasCompleted && (
          <button
            onClick={clearCompleted}
            className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-medium"
          >
            Clear done
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
                  : item.status === "cancelled"
                    ? "bg-yellow-500/5 border-yellow-500/20"
                    : "bg-[var(--color-surface)] border-[var(--color-border)]"
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0">
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {item.status === "failed" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              {item.status === "cancelled" && (
                <StopCircle className="h-4 w-4 text-yellow-500" />
              )}
              {item.status === "downloading" && (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              )}
              {item.status === "queued" && (
                <Download className="h-4 w-4 text-[var(--color-text-muted)]" />
              )}
            </div>

            {/* Info + progress */}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate font-medium">{item.filename}</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {formatBytes(item.fileSize)}
              </p>
              {item.status === "downloading" && (
                <ProgressBar
                  percent={item.progress}
                  stage={item.stage}
                  startedAt={item.startedAt}
                  className="mt-2"
                />
              )}
              {item.error && (
                <p className="text-[11px] text-red-500 dark:text-red-400 mt-1">
                  {item.error}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {item.status === "downloading" && (
                <button
                  onClick={() => cancelDownload(item.id)}
                  className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                  title="Cancel download"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                </button>
              )}
              {(item.status === "done" ||
                item.status === "failed" ||
                item.status === "cancelled") && (
                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
