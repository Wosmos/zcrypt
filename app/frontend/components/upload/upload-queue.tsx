"use client";

import { useUploadStore } from "@/store/upload";
import { ProgressBar } from "@/components/ui/progress-bar";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function UploadQueue() {
  const { queue, removeFromQueue, clearCompleted } = useUploadStore();

  if (queue.length === 0) return null;

  const hasCompleted = queue.some((i) => i.status === "done");

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Upload Queue
        </h3>
        {hasCompleted && (
          <button
            onClick={clearCompleted}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors font-medium"
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
                ? "bg-emerald-500/5 border-emerald-800/25"
                : item.status === "failed"
                  ? "bg-red-500/5 border-red-800/25"
                  : "bg-zinc-900/50 border-zinc-800/50"
            )}
          >
            <div className="flex-shrink-0">
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {item.status === "failed" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              {item.status !== "done" && item.status !== "failed" && (
                <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 truncate font-medium">
                {item.file.name}
              </p>
              <p className="text-[11px] text-zinc-600">
                {formatBytes(item.file.size)}
              </p>
              {item.status !== "done" &&
                item.status !== "failed" &&
                item.status !== "queued" && (
                  <ProgressBar
                    percent={item.progress}
                    stage={item.stage}
                    className="mt-2"
                  />
                )}
              {item.error && (
                <p className="text-[11px] text-red-400 mt-1">{item.error}</p>
              )}
            </div>

            <button
              onClick={() => removeFromQueue(item.id)}
              className="flex-shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
