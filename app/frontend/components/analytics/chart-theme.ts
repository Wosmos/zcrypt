import type { CSSProperties } from "react";

/** Shared recharts <Tooltip> theming — one look across every analytics chart. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "12px",
  fontSize: "12px",
  padding: "8px 12px",
  color: "var(--color-text)",
  boxShadow: "0 4px 12px -6px rgba(16, 24, 40, 0.16)",
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--color-text-secondary)",
};

/** Shared hover cursor for line/area charts (unused by pie charts). */
export const CHART_TOOLTIP_CURSOR = { stroke: "var(--color-border)", strokeWidth: 1 };
