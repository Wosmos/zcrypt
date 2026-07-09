import type { ReactNode } from "react";

export interface CodePanelProps {
  /** The `// leading comment` line. */
  comment: ReactNode;
  /** The closing emerald "✓ ..." summary line. */
  success: ReactNode;
  /** The freeform body lines in between (numbered steps, mock output, ...). */
  children: ReactNode;
}

/**
 * The terminal/code-block mock used across features/* pages: a monospace
 * panel with a comment header and an emerald success footer. The body lines
 * vary too much per page (inline colored spans, break-all, numbered steps) to
 * parameterize — only this shell is shared.
 */
export function CodePanel({ comment, success, children }: CodePanelProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
      <div className="mb-2 text-[var(--color-text-secondary)]">{comment}</div>
      {children}
      <div className="mt-4 text-emerald-500">{success}</div>
    </div>
  );
}
