import { cn } from "@/lib/utils";
import type { RingTone } from "@/lib/storage-usage";

const TONE_STROKE: Record<RingTone, string> = {
  ok: "stroke-[var(--color-accent)]",
  warn: "stroke-amber-500",
  danger: "stroke-red-500",
};

interface StorageRingProps {
  percent: number;
  tone: RingTone;
  unlimited?: boolean;
  size?: number;
  center?: string;
  className?: string;
}

export function StorageRing({
  percent,
  tone,
  unlimited,
  size = 44,
  center,
  className,
}: StorageRingProps) {
  const filled = unlimited ? 100 : percent;
  return (
    <span
      className={cn("relative inline-flex flex-shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3.5"
          className="stroke-[var(--color-surface-3)]"
        />
        {filled > 0 && (
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${filled} ${100 - filled}`}
            className={cn(
              "transition-[stroke-dasharray] duration-500 motion-reduce:transition-none",
              unlimited ? "stroke-[var(--color-accent)]/60" : TONE_STROKE[tone],
            )}
          />
        )}
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
        {unlimited ? "∞" : center}
      </span>
    </span>
  );
}
