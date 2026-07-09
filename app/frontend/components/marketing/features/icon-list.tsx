import type { ComponentType, ReactNode } from "react";
import { Check } from "@/lib/icons";

export interface IconListProps {
  items: ReactNode[];
  /** Leading icon per row. Default the cyan checkmark. */
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClassName?: string;
  iconStrokeWidth?: number;
  /** Per-`<li>` classes — callers vary gap size and items-center vs items-start
   *  (the latter when a line may wrap, usually paired with a `mt-0.5` on the icon). */
  itemClassName?: string;
  className?: string;
}

/**
 * The icon + one-line bullet list used across features/* pages (checklists,
 * trade-off callouts, trust signals). Every occurrence shares this shape —
 * only the icon and the copy vary.
 */
export function IconList({
  items,
  icon: Icon = Check,
  iconClassName = "h-4 w-4 flex-shrink-0 text-cyan-500",
  iconStrokeWidth = 3,
  itemClassName = "flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]",
  className = "mt-6 space-y-2.5",
}: IconListProps) {
  return (
    <ul className={className}>
      {items.map((item, i) => (
        <li key={i} className={itemClassName}>
          <Icon className={iconClassName} strokeWidth={iconStrokeWidth} />
          {item}
        </li>
      ))}
    </ul>
  );
}
