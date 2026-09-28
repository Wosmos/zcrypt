import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "@/lib/icons";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

export interface KpiCardTrend {
  direction: "up" | "down" | "flat";
  /** e.g. "18% vs last 30d". Rendered monochrome/accent-only by design — no
   *  red/green semantic coloring, to keep the app's single-accent language. */
  label: string;
}

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: IconComponent;
  hint?: ReactNode;
  /** Small pill in the top-left corner, e.g. an item count. */
  badge?: ReactNode;
  /** 0-100. When set, renders a ring gauge behind the icon instead of a flat chip. */
  percent?: number;
  trend?: KpiCardTrend | null;
  className?: string;
}

/**
 * The app-wide KPI/stat card. Visual design is lifted directly from the
 * "platform card" in components/settings/rate-limits.tsx (dotted backdrop,
 * bleeding icon watermark, centered content, optional ring gauge) rather than
 * the older components/ui/stat-card.tsx, which stays only for its existing
 * call sites. Use this for every new stat/KPI card going forward.
 *
 * This component renders the tile only — it does not manage the mobile
 * snap-carousel wrapper (each caller composes that around a row of cards; see
 * components/analytics/kpi-hero-row.tsx for the exact `flex snap-x
 * snap-mandatory ... sm:grid` pattern to reuse).
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  badge,
  percent,
  trend,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col items-center gap-2.5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-5 text-center transition-all hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface-1)]/70",
        className,
      )}
    >
      {/* Dotted backdrop, fading out toward the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(var(--color-text-muted)_0.75px,transparent_0.75px)] [background-size:9px_9px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
      />
      {/* Blended icon watermark, bleeding off the top-right */}
      <div aria-hidden className="pointer-events-none absolute -right-4 -top-4 opacity-[0.07]">
        <Icon className="h-24 w-24" />
      </div>

      {badge && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-[var(--color-surface-2)]/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-muted)] backdrop-blur-sm">
          {badge}
        </span>
      )}
      {trend && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-surface-2)]/80 px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-secondary)] backdrop-blur-sm">
          {trend.direction === "up" && <ArrowUp className="h-2.5 w-2.5" />}
          {trend.direction === "down" && <ArrowDown className="h-2.5 w-2.5" />}
          {trend.label}
        </span>
      )}

      {percent != null ? (
        <div className="relative z-10 h-[64px] w-[64px]">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="2.75"
              className="stroke-[var(--color-surface-2)]"
            />
            <circle
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeDasharray={`${Math.min(100, Math.max(0, percent))} 100`}
              className="stroke-[var(--color-accent)] transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-6 w-6 text-[var(--color-accent)]" />
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex h-[64px] w-[64px] items-center justify-center rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <Icon className="h-6 w-6 text-[var(--color-accent)]" />
        </div>
      )}

      <div className="relative z-10 min-w-0">
        <p className="truncate font-heading text-2xl font-bold tabular-nums tracking-tight text-[var(--color-text)]">
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </p>
        {hint && (
          <p className="mt-1 truncate text-[11px] tabular-nums text-[var(--color-text-muted)]">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
