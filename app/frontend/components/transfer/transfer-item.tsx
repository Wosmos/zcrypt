"use client";

import { memo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  StopCircle,
  Pause,
  Play,
  RotateCcw,
  X,
} from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn, formatBytes, formatEta, easeProgress } from "@/lib/utils";

// A single unified view-model the manager builds from the upload + download
// stores. The manager owns store wiring; this component is presentational and
// only calls back the handlers it's given.
export type TransferDirection = "upload" | "download";
export type TransferState =
  | "queued"
  | "active"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export interface TransferEntry {
  /** Stable key, prefixed by direction so upload + download ids never collide. */
  key: string;
  /** Underlying store id (used for the control callbacks). */
  id: string;
  direction: TransferDirection;
  name: string;
  /** 0–100 raw percent (eased for display only). */
  progress: number;
  state: TransferState;
  stage?: string;
  error?: string;
  /** Bytes label shown on the right (file size). */
  sizeBytes?: number;
  /** Bytes uploaded so far (uploads only) — drives the true-ratio bar width. */
  bytesProcessed?: number;
  /** Total bytes to upload (uploads only) — drives the true-ratio bar width. */
  totalBytes?: number;
  /** For ETA math — kept raw, never eased. */
  startedAt: number;
}

export interface TransferItemControls {
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancelUpload: (id: string) => void;
  onRetryUpload: (id: string) => void;
  onStopDownload: (id: string) => void;
  onRetryDownload: (id: string) => void;
  onDismiss: (entry: TransferEntry) => void;
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        "text-[var(--color-text-muted)]",
        "hover:bg-[var(--color-surface-1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        tone === "accent" && "hover:text-[var(--color-accent)]",
        tone === "danger" && "hover:text-rose-500",
        tone === "neutral" && "hover:text-[var(--color-text)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function StatusGlyph({ entry }: { entry: TransferEntry }) {
  const DirIcon = entry.direction === "upload" ? Upload : Download;
  switch (entry.state) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-rose-500" />;
    case "cancelled":
      return <StopCircle className="h-4 w-4 text-amber-500" />;
    case "paused":
      return <Pause className="h-4 w-4 text-[var(--color-text-secondary)]" />;
    case "active":
      return <LogoSpinner size={16} speed="fast" />;
    case "queued":
    default:
      return <DirIcon className="h-4 w-4 text-[var(--color-text-muted)]" />;
  }
}

function statusText(entry: TransferEntry): string {
  if (entry.state === "failed") return entry.error || "Failed";
  if (entry.state === "cancelled") return "Cancelled";
  if (entry.state === "done") return entry.direction === "upload" ? "Uploaded" : "Downloaded";
  if (entry.state === "paused") return entry.stage || "Paused";
  if (entry.state === "queued") return "Queued";
  // active
  const eta = formatEta(entry.startedAt, entry.progress);
  if (eta) return `${entry.stage || (entry.direction === "upload" ? "Uploading" : "Downloading")} · ${eta}`;
  return entry.stage || (entry.direction === "upload" ? "Uploading" : "Downloading");
}

function TransferItemBase({
  entry,
  controls,
}: {
  entry: TransferEntry;
  controls: TransferItemControls;
}) {
  const reduceMotion = useReducedMotion();
  const showBar = entry.state === "active" || entry.state === "paused";
  const eased = easeProgress(entry.progress);
  const failedLike = entry.state === "failed" || entry.state === "cancelled";

  // Bar width = TRUE ratio so it never appears to stall (M5-progress). The
  // log-eased value above is display-only and stays on the % label. For uploads
  // with real byte counts, use bytesProcessed/totalBytes; otherwise (and for all
  // downloads) fall back to the raw item.progress.
  const barProgress =
    entry.direction === "upload" &&
    typeof entry.bytesProcessed === "number" &&
    typeof entry.totalBytes === "number" &&
    entry.totalBytes > 0
      ? Math.min(100, Math.max(0, (entry.bytesProcessed / entry.totalBytes) * 100))
      : entry.progress;

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors",
        entry.state === "done" && "border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5",
        entry.state === "failed" && "border-rose-500/20 bg-rose-500/5",
        entry.state === "cancelled" && "border-amber-500/20 bg-amber-500/5",
        (entry.state === "active" || entry.state === "queued" || entry.state === "paused") &&
          "border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0">
          <StatusGlyph entry={entry} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-[var(--color-text)]">{entry.name}</p>
            <div className="flex flex-shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-[var(--color-text-muted)]">
              {typeof entry.sizeBytes === "number" && entry.sizeBytes > 0 && (
                <span>{formatBytes(entry.sizeBytes)}</span>
              )}
              {entry.state === "active" && <span>{eased}%</span>}
            </div>
          </div>

          {showBar && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <motion.div
                className="h-full rounded-full bg-[var(--color-accent)]"
                initial={false}
                animate={{ width: `${barProgress}%` }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
              />
            </div>
          )}

          <p
            role="status"
            className={cn(
              "mt-0.5 truncate text-[10px]",
              failedLike ? "text-rose-500 dark:text-rose-400" : "text-[var(--color-text-muted)]",
            )}
          >
            {statusText(entry)}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          {/* Upload — active: Pause + Cancel */}
          {entry.direction === "upload" && entry.state === "active" && (
            <>
              <ControlButton icon={Pause} label="Pause upload" tone="accent" onClick={() => controls.onPause(entry.id)} />
              <ControlButton icon={X} label="Cancel upload" tone="danger" onClick={() => controls.onCancelUpload(entry.id)} />
            </>
          )}

          {/* Upload — queued: only Cancel (no chunks in flight yet) */}
          {entry.direction === "upload" && entry.state === "queued" && (
            <ControlButton icon={X} label="Cancel upload" tone="danger" onClick={() => controls.onCancelUpload(entry.id)} />
          )}

          {/* Upload — paused: Resume + Cancel */}
          {entry.direction === "upload" && entry.state === "paused" && (
            <>
              <ControlButton icon={Play} label="Resume upload" tone="accent" onClick={() => controls.onResume(entry.id)} />
              <ControlButton icon={X} label="Cancel upload" tone="danger" onClick={() => controls.onCancelUpload(entry.id)} />
            </>
          )}

          {/* Upload — failed: Retry + Dismiss */}
          {entry.direction === "upload" && entry.state === "failed" && (
            <>
              <ControlButton icon={RotateCcw} label="Retry upload" tone="accent" onClick={() => controls.onRetryUpload(entry.id)} />
              <ControlButton icon={X} label="Dismiss" onClick={() => controls.onDismiss(entry)} />
            </>
          )}

          {/* Download — active/queued: Stop */}
          {entry.direction === "download" && (entry.state === "active" || entry.state === "queued") && (
            <ControlButton icon={StopCircle} label="Stop download" tone="danger" onClick={() => controls.onStopDownload(entry.id)} />
          )}

          {/* Download — failed/cancelled: Retry + Dismiss */}
          {entry.direction === "download" && (entry.state === "failed" || entry.state === "cancelled") && (
            <>
              <ControlButton icon={RotateCcw} label="Retry download" tone="accent" onClick={() => controls.onRetryDownload(entry.id)} />
              <ControlButton icon={X} label="Dismiss" onClick={() => controls.onDismiss(entry)} />
            </>
          )}

          {/* Done — Dismiss */}
          {entry.state === "done" && (
            <ControlButton icon={X} label="Dismiss" onClick={() => controls.onDismiss(entry)} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const TransferItem = memo(TransferItemBase);
