import type { ReactNode } from "react";
import { Check, X } from "@/lib/icons";

interface ComparisonCell {
  good: boolean;
  note: ReactNode;
}

export interface ComparisonRow {
  label: ReactNode;
  zcrypt: ComparisonCell;
  other: ComparisonCell;
}

export interface ComparisonTableProps {
  /** Competitor display name for the header column, e.g. "Dropbox". */
  otherName: ReactNode;
  rows: ComparisonRow[];
  /** Section heading, e.g. "zcrypt vs Dropbox, side by side". */
  heading: ReactNode;
  subheading: ReactNode;
  /** Trademark / disclaimer line under the table. */
  footnote: ReactNode;
}

/**
 * The side-by-side capability comparison table shared by every vs/* page. Two
 * value columns — zcrypt (cyan checks) and the competitor (emerald checks) —
 * with muted X marks where a capability is absent. Renders inside its own
 * surface-filled, border-y section with a centered heading block and a
 * horizontally scrollable table on narrow screens.
 */
export function ComparisonTable({
  otherName,
  rows,
  heading,
  subheading,
  footnote,
}: ComparisonTableProps) {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h2>
          <p className="mt-3 text-[var(--color-text-secondary)]">{subheading}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-1/3 py-4 pr-4 font-semibold text-[var(--color-text-secondary)]">
                  Capability
                </th>
                <th className="py-4 px-4 font-heading text-base font-bold text-cyan-600 dark:text-cyan-400">
                  zcrypt
                </th>
                <th className="py-4 px-4 font-heading text-base font-bold">{otherName}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] align-top">
                  <th
                    scope="row"
                    className="py-4 pr-4 text-left font-medium text-[var(--color-text)]"
                  >
                    {row.label}
                  </th>
                  <td className="py-4 px-4">
                    <div className="flex gap-2">
                      {row.zcrypt.good ? (
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                      )}
                      <span className="text-[var(--color-text-secondary)]">{row.zcrypt.note}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex gap-2">
                      {row.other.good ? (
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={3} />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                      )}
                      <span className="text-[var(--color-text-secondary)]">{row.other.note}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">{footnote}</p>
      </div>
    </section>
  );
}
