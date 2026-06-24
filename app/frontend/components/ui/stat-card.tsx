import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

interface StatCardProps {
  /** Metric label, e.g. "Storage used". */
  label: string;
  /** Metric value. Rendered with tabular-nums for stable alignment. */
  value: ReactNode;
  /** Leading icon component (from "@/lib/icons"). */
  icon: IconComponent;
  /** Optional secondary hint shown beneath the value (e.g. "of 10 GB"). */
  hint?: ReactNode;
  /** When true, tints the icon chip with the accent color for emphasis. */
  accent?: boolean;
  className?: string;
}

/** Compact metric card: labelled value with a leading icon chip and optional hint. Values use tabular-nums. */
export function StatCard({ label, value, icon: Icon, hint, accent, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "panel flex items-start gap-4 p-5 transition-colors",
        className
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1",
          accent
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-[var(--color-accent)]/20"
            : "bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] ring-[var(--color-border)]"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </p>
        <p className="truncate text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-text)]">
          {value}
        </p>
        {hint && (
          <p className="truncate text-xs text-[var(--color-text-secondary)] tabular-nums">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
