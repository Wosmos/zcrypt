import type { ReactNode } from "react";
import Link from "next/link";

export interface BreakdownRow {
  key: string;
  label: ReactNode;
  count: number;
  /** Shown after the count, e.g. a byte total. */
  extra?: string;
  href?: string;
}

/** A labelled horizontal bar list, scaled to its largest row. */
export function BreakdownList({ rows, empty }: { rows: BreakdownRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-[var(--color-text-muted)]">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--color-text)]">{r.label}</span>
              <span className="flex-shrink-0 tabular-nums text-[var(--color-text-muted)]">
                {r.count.toLocaleString()}
                {r.extra && <span className="ms-1.5 opacity-80">{r.extra}</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]/80"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link
                href={r.href}
                className="-mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
