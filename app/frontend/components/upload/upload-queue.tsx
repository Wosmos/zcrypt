"use client";

import { useState, useEffect } from "react";
import { useUploadStore } from "@/store/upload";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import { X, CheckCircle2, AlertCircle, ChevronDown, RotateCcw } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

function ProgressArc({ percent, size = 24, strokeWidth = 2.5 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  // Only draw 25% of the circle as the track (quarter arc)
  const fullCircumference = 2 * Math.PI * radius;
  const arcLength = fullCircumference * 0.25;
  const filledLength = (Math.min(100, Math.max(0, percent)) / 100) * arcLength;

  return (
    <svg width={size} height={size} className="flex-shrink-0" style={{ transform: "rotate(-90deg)" }}>
      {/* 25% arc track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${arcLength} ${fullCircumference}`}
        strokeLinecap="round"
      />
      {/* Progress fill within the arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(6 182 212)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${filledLength} ${fullCircumference}`}
        strokeLinecap="round"
        className="transition-[stroke-dasharray] duration-500 ease-out"
      />
    </svg>
  );
}

function MiniProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden mt-1">
      <div
        className="h-full rounded-full bg-cyan-500 transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function UploadQueue() {
  const { queue, removeFromQueue, clearCompleted, retryUpload } = useUploadStore();
  const [expanded, setExpanded] = useState(false);

  // Block page reload / tab close while uploads are in progress
  const hasActiveUploads = queue.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );
  useEffect(() => {
    if (!hasActiveUploads) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveUploads]);

  if (queue.length === 0) return null;

  const completedCount = queue.filter((i) => i.status === "done").length;
  const failedCount = queue.filter((i) => i.status === "failed").length;
  const queuedCount = queue.filter((i) => i.status === "queued").length;
  const totalCount = queue.length;
  const allDone = completedCount + failedCount === totalCount;

  // Overall progress: average of all items
  const overallProgress = totalCount > 0
    ? Math.round(queue.reduce((sum, i) => {
        if (i.status === "done") return sum + 100;
        if (i.status === "failed") return sum + 100;
        return sum + (i.progress || 0);
      }, 0) / totalCount)
    : 0;

  const failedItems = queue.filter((i) => i.status === "failed");

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-lg animate-fade-in">
      {/* Compact header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-1)]/50 transition-colors"
      >
        {/* Progress ring */}
        {allDone ? (
          <div className="flex-shrink-0">
            {failedCount > 0 ? (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-cyan-500" />
            )}
          </div>
        ) : (
          <ProgressArc percent={overallProgress} />
        )}

        {/* Status text */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate">
            {allDone ? (
              failedCount > 0
                ? `${completedCount} uploaded, ${failedCount} failed`
                : `${completedCount} file${completedCount !== 1 ? "s" : ""} uploaded`
            ) : (
              <>
                <span className="tabular-nums">{completedCount}/{totalCount}</span>
                {" "}uploading
                {queuedCount > 0 && (
                  <span className="text-[var(--color-text-muted)]"> ({queuedCount} queued)</span>
                )}
              </>
            )}
          </p>
          {/* Mini progress bar in header - only when uploading */}
          {!allDone && (
            <div className="h-1 w-full rounded-full bg-[var(--color-surface-2)] mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-500 transition-[width] duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* Desktop progress text */}
        {!allDone && (
          <span className="hidden sm:block text-xs tabular-nums text-[var(--color-text-muted)] flex-shrink-0">
            {overallProgress}%
          </span>
        )}

        {/* Expand/collapse chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180"
          )}
        />

        {/* Clear button when all done */}
        {allDone && (
          <div
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              clearCompleted();
            }}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </div>
        )}
      </button>

      {/* Expandable file list with individual progress */}
      {expanded && (
        <div className="border-t border-[var(--color-border)]">
          <div className="overflow-y-auto p-2 space-y-1.5">
            {queue.map((item) => {
              const isActive = item.status !== "done" && item.status !== "failed" && item.status !== "queued";
              const progress = item.progress || 0;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "px-3 py-2.5 rounded-lg transition-colors",
                    item.status === "done" && "bg-cyan-500/5",
                    item.status === "failed" && "bg-red-500/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <div className="flex-shrink-0">
                      {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500" />}
                      {item.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                      {item.status === "queued" && (
                        <div className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]" />
                      )}
                      {isActive && <LogoSpinner size={14} speed="fast" />}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs truncate font-medium">{item.file.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] flex-shrink-0 tabular-nums">
                          <span>{formatBytes(item.file.size)}</span>
                          {isActive && <span>{progress}%</span>}
                        </div>
                      </div>

                      {/* Per-file progress bar — shown for active uploads */}
                      {isActive && <MiniProgressBar percent={progress} />}

                      {/* Stage label */}
                      {item.stage && isActive && (
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{item.stage}</p>
                      )}

                      {/* Error message */}
                      {item.error && (
                        <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 truncate">{item.error}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Retry — only on failed items, gives the user manual control */}
                      {item.status === "failed" && (
                        <button
                          onClick={() => {
                            const pass = usePassphraseStore.getState().getPassphrase();
                            if (!pass) {
                              toast.error("Session passphrase expired — re-upload the file to retry");
                              return;
                            }
                            retryUpload(item.id, pass);
                          }}
                          title="Retry upload"
                          className="text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                      {/* Remove button */}
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        title="Remove"
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {completedCount > 0 && (
            <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-1)]/30">
              <button
                onClick={clearCompleted}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-medium"
              >
                Clear completed
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapsed: show failed items inline (important to surface errors) */}
      {!expanded && failedItems.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-2 bg-red-500/5">
          {failedItems.slice(0, 2).map((item) => (
            <p key={item.id} className="text-[10px] text-red-500 dark:text-red-400 truncate">
              {item.file.name}: {item.error || "Failed"}
            </p>
          ))}
          {failedItems.length > 2 && (
            <p className="text-[10px] text-red-400/70">+{failedItems.length - 2} more errors</p>
          )}
        </div>
      )}
    </div>
  );
}
