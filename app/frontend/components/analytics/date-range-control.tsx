"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAnalyticsFiltersStore, type DateRangePreset } from "@/store/analytics-filters";
import { Calendar } from "@/lib/icons";
import { cn, formatDateShort } from "@/lib/utils";

const PRESETS: { value: Exclude<DateRangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

function CustomRangeForm({
  initialStart,
  initialEnd,
  onApply,
  onCancel,
}: {
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(initialStart ?? today);
  const [end, setEnd] = useState(initialEnd ?? today);

  return (
    <div className="space-y-4 p-1">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Custom range</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-xs text-[var(--color-text-muted)]">
          From
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>
        <label className="block space-y-1 text-xs text-[var(--color-text-muted)]">
          To
          <input
            type="date"
            value={end}
            min={start}
            max={today}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(start, end)}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/**
 * The page-wide date-range control: a 6-pill segmented ToggleGroup (Today /
 * 7d / 30d / 90d / All time / Custom), matching the ToggleGroup recipe
 * upload-chart.tsx used to own locally. Custom opens a small picker — a
 * Dialog on desktop, a BottomSheet on mobile (useIsMobile) — with two native
 * date inputs rather than a bespoke calendar widget (no Popover/Calendar
 * primitive exists in this codebase yet, and this keeps it that way).
 */
export function DateRangeControl() {
  const { preset, customStart, customEnd, setPreset, setCustomRange } = useAnalyticsFiltersStore();
  const [customOpen, setCustomOpen] = useState(false);
  const isMobile = useIsMobile();

  const customLabel =
    preset === "custom" && customStart && customEnd
      ? `${formatDateShort(customStart)} – ${formatDateShort(customEnd)}`
      : "Custom";

  function handleApply(start: string, end: string) {
    setCustomRange(start, end);
    setCustomOpen(false);
  }

  const form = (
    <CustomRangeForm
      initialStart={customStart}
      initialEnd={customEnd}
      onApply={handleApply}
      onCancel={() => setCustomOpen(false)}
    />
  );

  return (
    <div className="flex justify-end">
      <ToggleGroup
        type="single"
        value={preset === "custom" ? "custom" : preset}
        onValueChange={(v) => {
          if (!v) return;
          if (v === "custom") {
            setCustomOpen(true);
            return;
          }
          setPreset(v as DateRangePreset);
        }}
        className="flex-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-0.5"
        aria-label="Select date range"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.value}
            value={p.value}
            aria-label={p.label}
            className="h-8 rounded-md px-2.5 text-xs font-medium text-[var(--color-text-secondary)] data-[state=on]:bg-[var(--color-surface)] data-[state=on]:text-[var(--color-text)] data-[state=on]:shadow-sm"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem
          value="custom"
          aria-label="Custom range"
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[var(--color-text-secondary)] data-[state=on]:bg-[var(--color-surface)] data-[state=on]:text-[var(--color-text)] data-[state=on]:shadow-sm",
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {customLabel}
        </ToggleGroupItem>
      </ToggleGroup>

      {isMobile ? (
        <BottomSheet open={customOpen} onClose={() => setCustomOpen(false)}>
          {form}
        </BottomSheet>
      ) : (
        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="max-w-sm">{form}</DialogContent>
        </Dialog>
      )}
    </div>
  );
}
