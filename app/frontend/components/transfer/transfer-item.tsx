"use client";

import { memo, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { Check, Pause, Play, StopCircle, X, type IconProps } from "@/lib/icons";
import { cn, formatBytes } from "@/lib/utils";
import { translateLabel, type TransferPhase, type TransferView } from "@/lib/transfer-progress";
import { TONE, TransferThumb } from "./transfer-parts";

export type TransferState = "queued" | "active" | "paused" | "done" | "failed" | "cancelled";

/** One upload or download as the panel shows it. */
export interface TransferEntry {
  /** Stable key, prefixed by direction so upload and download ids never collide. */
  key: string;
  /** Underlying store id (used for the control callbacks). */
  id: string;
  direction: "upload" | "download";
  name: string;
  /** Vault file id, once known: drives the thumbnail. */
  fileId?: string;
  state: TransferState;
  view: TransferView;
  sizeBytes?: number;
  bytesProcessed?: number;
  totalBytes?: number;
  rateBps?: number;
  etaSeconds?: number;
  startedAt: number;
  /** Destination folder of an upload (null = vault root). */
  folderId?: string | null;
  /** Core-driven desktop (Tauri) upload: the Rust core has no pause. */
  desktop?: boolean;
}

/** Row actions, all wired by the manager. */
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

const DOWNLOAD_PHASES = new Set<TransferPhase>(["fetching", "unlocking", "saving"]);
const IDLE_PHASES = new Set<TransferPhase>(["queued", "choose", "paused", "offline", "stopped"]);

function barColor(phase: TransferPhase): string {
  if (DOWNLOAD_PHASES.has(phase)) return TONE.ok;
  if (IDLE_PHASES.has(phase)) return "var(--color-text-muted)";
  return TONE.accent;
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <Icon className="h-3.5 w-3.5" weight="bold" />
    </button>
  );
}

function RowControls({
  entry,
  controls,
}: {
  entry: TransferEntry;
  controls: TransferItemControls;
}) {
  const t = useTranslations("app.transfer");
  const { id, state } = entry;
  if (state === "done" || state === "failed" || state === "cancelled")
    return (
      <ControlButton icon={X} label={t("dismiss")} onClick={() => controls.onDismiss(entry)} />
    );
  if (entry.direction === "upload") {
    const cancel = (
      <ControlButton
        icon={X}
        label={t("cancelUpload")}
        onClick={() => controls.onCancelUpload(id)}
      />
    );
    if (state === "paused")
      return (
        <>
          <ControlButton
            icon={Play}
            label={t("resumeUpload")}
            onClick={() => controls.onResume(id)}
          />
          {cancel}
        </>
      );
    return (
      <>
        {state === "active" && !entry.desktop && (
          <ControlButton
            icon={Pause}
            label={t("pauseUpload")}
            onClick={() => controls.onPause(id)}
          />
        )}
        {cancel}
      </>
    );
  }
  const stop = (
    <ControlButton
      icon={StopCircle}
      label={t("stopDownload")}
      onClick={() => controls.onStopDownload(id)}
    />
  );
  if (state === "paused")
    return (
      <>
        <ControlButton
          icon={Play}
          label={t("resumeDownload")}
          onClick={() => controls.onResumeDownload(id)}
        />
        {stop}
      </>
    );
  return (
    <>
      {state === "active" && (
        <ControlButton
          icon={Pause}
          label={t("pauseDownload")}
          onClick={() => controls.onPauseDownload(id)}
        />
      )}
      {stop}
    </>
  );
}

function TransferItemBase({
  entry,
  controls,
  canHover,
}: {
  entry: TransferEntry;
  controls: TransferItemControls;
  /** Desktop pointer: controls appear on hover and focus; on touch they always show. */
  canHover: boolean;
}) {
  const t = useTranslations("app.transfer");
  const text = translateLabel(t, entry.view.label);
  const failed = entry.state === "failed" || entry.state === "cancelled";
  const done = entry.state === "done";
  const { phase, bar } = entry.view;
  const retryLabel = entry.direction === "upload" && entry.desktop ? t("resumeUpload") : t("retry");
  const retry = () =>
    entry.direction === "upload"
      ? controls.onRetryUpload(entry.id)
      : controls.onRetryDownload(entry.id);

  return (
    <div
      data-transfer-row={entry.key}
      data-state={entry.state}
      className={cn(
        "group flex items-center gap-3 px-3.5 py-2.5 transition-colors",
        failed && "bg-[color-mix(in_oklab,var(--toast-error)_8%,transparent)]",
      )}
    >
      <TransferThumb fileId={entry.fileId} name={entry.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--color-text)]" title={entry.name}>
          {entry.name}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] leading-snug text-[var(--color-text-muted)]">
          {!failed && !done && (
            <span
              className="relative block h-1 w-[30%] min-w-12 max-w-[130px] flex-none overflow-hidden rounded-full bg-[var(--color-surface-2)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(bar)}
              aria-label={entry.name}
            >
              <span
                data-bar={phase}
                className={cn(
                  "absolute inset-y-0 start-0 overflow-hidden rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                  phase === "checking" && "animate-pulse",
                )}
                style={{ width: `${bar}%`, background: barColor(phase) }}
              >
                {(phase === "securing" || phase === "sending" || phase === "fetching") && (
                  <span className="animate-bar-sheen absolute inset-y-0 start-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                )}
              </span>
            </span>
          )}
          {done && (
            <Check className="h-3.5 w-3.5 flex-none" weight="bold" style={{ color: TONE.ok }} />
          )}
          <span
            className={cn("min-w-0", failed ? "line-clamp-2" : "truncate")}
            style={failed ? { color: TONE.err } : done ? { color: TONE.ok } : undefined}
          >
            {text}
            {done && entry.sizeBytes ? ` · ${formatBytes(entry.sizeBytes)}` : ""}
          </span>
        </div>
      </div>
      {failed && (
        <button
          type="button"
          onClick={retry}
          className="flex-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {retryLabel}
        </button>
      )}
      <div
        data-row-controls
        data-hover-only={canHover ? "true" : "false"}
        className={cn(
          "flex flex-none items-center gap-0.5",
          canHover &&
            "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <RowControls entry={entry} controls={controls} />
      </div>
    </div>
  );
}

/** One row: thumbnail, name, a single status line, and its controls. */
export const TransferItem = memo(TransferItemBase);
