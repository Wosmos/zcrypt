"use client";

/**
 * Labelled progress bar shared by send-tool and transfer-tool.
 *
 * `percent` is the already-computed display value — the caller decides whether
 * to ease it (send eases via `easeProgress`, transfer passes the raw percent),
 * and both the label and the bar width use exactly this number.
 *
 * `transitionClassName` carries the per-caller bar transition (transfer uses
 * `duration-300`, send uses `duration-500 ease-in-out`).
 */
export function ProgressBar({
  stage,
  percent,
  transitionClassName = "transition-all duration-300",
}: {
  stage: string;
  percent: number;
  transitionClassName?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-muted)]">{stage}</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
        <div className={`h-full rounded-full bg-[var(--color-accent)] ${transitionClassName}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
