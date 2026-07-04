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
  /** Smoothed transfer rate in bytes/sec (uploads only) — speed + ETA display. */
  rateBps?: number;
  /** For download ETA math — kept raw, never eased. */
  startedAt: number;
}

export interface TransferItemControls {
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancelUpload: (id: string) => void;
  onRetryUpload: (id: string) => void;
  onPauseDownload: (id: string) => void;
  onResumeDownload: (id: string) => void;
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
      // Direction-explicit + animated: an upload arrow drifts up in the accent
      // colour, a download arrow drifts down in cyan — so "which way is this
      // going" is obvious at a glance without reading the stage text. (The dock
      // header still shows the brand spinner for overall "working" state.)
      return (
        <DirIcon
          className={cn(
            "h-4 w-4",
            entry.direction === "upload"
              ? "text-[var(--color-accent)] animate-nudge-up"
              : "text-cyan-500 animate-nudge-down",
          )}
        />
      );
    case "queued":
    default:
      return <DirIcon className="h-4 w-4 text-[var(--color-text-muted)]" />;
  }
}

// "~40s left" from a seconds estimate (rate-based, so it doesn't inherit the
// queue-wait/pause time the old percent-extrapolation ETA did).
function formatRemaining(seconds: number): string | undefined {
  if (!isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds < 60) return `~${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m left`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `~${h}h ${m}m left`;
}

function statusText(entry: TransferEntry, short = false): string {
  if (entry.state === "failed") return entry.error || "Failed";
  if (entry.state === "cancelled") return "Cancelled";
  if (entry.state === "done") return entry.direction === "upload" ? "Uploaded" : "Downloaded";
  if (entry.state === "paused") return entry.stage || "Paused";
  if (entry.state === "queued") return "Queued";
  // active. Uploads: speed + ETA from the smoothed byte rate (accurate, stable).
  // Downloads: the old elapsed/percent extrapolation (no byte rate available).
  let eta: string | undefined;
  if (
    entry.direction === "upload" &&
    typeof entry.rateBps === "number" && entry.rateBps > 0 &&
    typeof entry.bytesProcessed === "number" &&
    typeof entry.totalBytes === "number" && entry.totalBytes > 0
  ) {
    const speed = `${formatBytes(entry.rateBps)}/s`;
    const left = formatRemaining((entry.totalBytes - entry.bytesProcessed) / entry.rateBps);
    eta = left ? `${speed} · ${left}` : speed;
  } else if (entry.direction === "download") {
    eta = formatEta(entry.startedAt, entry.progress);
  }
  const verb = entry.stage || (entry.direction === "upload" ? "Uploading" : "Downloading");
  // Mobile: the spinner + name already convey direction — show just the ETA when
  // we have one, so the line stays tight on narrow screens.
  if (short) return eta || verb;
  if (eta) return `${verb} · ${eta}`;
  return verb;
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
  const failedLike = entry.state === "failed" || entry.state === "cancelled";

  // Bar width = TRUE byte ratio so it never appears to stall (M5-progress). For
  // uploads with real byte counts, use bytesProcessed/totalBytes; otherwise (and
  // for all downloads) fall back to the raw item.progress.
  const hasBytes =
    entry.direction === "upload" &&
    typeof entry.bytesProcessed === "number" &&
    typeof entry.totalBytes === "number" &&
    entry.totalBytes > 0;
  const barProgress = hasBytes
    ? Math.min(100, Math.max(0, ((entry.bytesProcessed as number) / (entry.totalBytes as number)) * 100))
    : entry.progress;
  // The % label MATCHES the bar when real bytes exist (the old log-eased label
  // said 74% while the bar showed half-width — two different lies). The eased
  // curve remains only for byte-less phases (encrypting) and downloads. Capped
  // at 99 while active so "100%" can only ever mean done.
  const labelPct = Math.min(99, Math.round(hasBytes && (entry.bytesProcessed as number) > 0 ? barProgress : easeProgress(entry.progress)));
  // Finalize is a short server round-trip with no byte movement — show an
  // indeterminate full bar instead of a frozen 97%.
  const isFinalizing = entry.state === "active" && (entry.stage?.startsWith("Finalizing") ?? false);

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
              {entry.state === "active" && <span>{labelPct}%</span>}
            </div>
          </div>

          {showBar && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <motion.div
                className={cn(
                  "relative h-full overflow-hidden rounded-full bg-[var(--color-accent)]",
                  isFinalizing && "animate-pulse",
                )}
                initial={false}
                animate={{ width: isFinalizing ? "100%" : `${barProgress}%` }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
              >
                {/* Microsoft-style sheen swept across the fill while actively
                    transferring (not while paused/finalizing) — reads as motion
                    even when a chunk is momentarily stalled. */}
                {entry.state === "active" && !isFinalizing && !reduceMotion && (
                  <span className="animate-bar-sheen absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                )}
              </motion.div>
            </div>
          )}

          <p
            role="status"
            className={cn(
              "mt-0.5 truncate text-[10px]",
              failedLike ? "text-rose-500 dark:text-rose-400" : "text-[var(--color-text-muted)]",
            )}
          >
            <span className="sm:hidden">{statusText(entry, true)}</span>
            <span className="hidden sm:inline">{statusText(entry, false)}</span>
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

          {/* Download — active: Pause + Stop */}
          {entry.direction === "download" && entry.state === "active" && (
            <>
              <ControlButton icon={Pause} label="Pause download" tone="accent" onClick={() => controls.onPauseDownload(entry.id)} />
              <ControlButton icon={StopCircle} label="Stop download" tone="danger" onClick={() => controls.onStopDownload(entry.id)} />
            </>
          )}

          {/* Download — queued: only Stop (nothing to pause yet) */}
          {entry.direction === "download" && entry.state === "queued" && (
            <ControlButton icon={StopCircle} label="Stop download" tone="danger" onClick={() => controls.onStopDownload(entry.id)} />
          )}

          {/* Download — paused: Resume + Stop */}
          {entry.direction === "download" && entry.state === "paused" && (
            <>
              <ControlButton icon={Play} label="Resume download" tone="accent" onClick={() => controls.onResumeDownload(entry.id)} />
              <ControlButton icon={StopCircle} label="Stop download" tone="danger" onClick={() => controls.onStopDownload(entry.id)} />
            </>
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
