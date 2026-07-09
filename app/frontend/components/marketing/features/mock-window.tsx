import type { ComponentType, ReactNode } from "react";

export interface MockWindowFrameProps {
  children: ReactNode;
  maxWidth?: string;
  /** Three traffic-light dots (default). Set false to pass a custom `leading` node instead. */
  dots?: boolean;
  /** Replaces the traffic-light dots when `dots` is false (e.g. a pulsing status dot). */
  leading?: ReactNode;
  /** Label shown after the dots/leading node. */
  label?: ReactNode;
  labelIcon?: ComponentType<{ className?: string }>;
  /** Trailing pill badge (e.g. "Encrypted before upload"). */
  badgeIcon?: ComponentType<{ className?: string }>;
  badgeLabel?: ReactNode;
  /** Override the body wrapper's padding. Default "p-3 sm:p-4". */
  contentClassName?: string;
}

/**
 * The fake macOS-style window chrome (traffic lights + header bar + optional
 * trailing status pill) wrapping every features/* hero mock. The mock body is
 * genuinely page-specific and stays as `children`.
 */
export function MockWindowFrame({
  children,
  maxWidth = "max-w-4xl",
  dots = true,
  leading,
  label,
  labelIcon: LabelIcon,
  badgeIcon: BadgeIcon,
  badgeLabel,
  contentClassName = "p-3 sm:p-4",
}: MockWindowFrameProps) {
  return (
    <div className={`mx-auto mt-16 ${maxWidth}`}>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
          {dots ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </>
          ) : (
            leading
          )}
          {label && (
            <div className="ml-3 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">
              {LabelIcon && <LabelIcon className="h-3 w-3" />} {label}
            </div>
          )}
          {badgeLabel && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
              {BadgeIcon && <BadgeIcon className="h-2.5 w-2.5" />} {badgeLabel}
            </span>
          )}
        </div>
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
}
