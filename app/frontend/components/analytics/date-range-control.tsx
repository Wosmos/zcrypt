"use client";

import { useEffect, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { useAnalyticsFiltersStore, type DateRangePreset } from "@/store/analytics-filters";
import { Calendar } from "@/lib/icons";
import { cn, formatDateShort, localDateKey } from "@/lib/utils";

const PRESETS: { value: Exclude<DateRangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

/**
 * The page-wide date-range control: a 6-pill segmented ToggleGroup (Today /
 * 7d / 30d / 90d / All time / Custom), matching the ToggleGroup recipe
 * upload-chart.tsx used to own locally. Custom opens a small themed panel
 * anchored right under the pill (not a modal/sheet) with a from-scratch
 * calendar (components/ui/calendar.tsx, no date library), closed on outside
 * click or Escape.
 */
export function DateRangeControl() {
  const { preset, customStart, customEnd, setPreset, setCustomRange } = useAnalyticsFiltersStore();
  const [customOpen, setCustomOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = localDateKey(new Date());
  const [start, setStart] = useState(customStart ?? "");
  const [end, setEnd] = useState(customEnd ?? "");

  useEffect(() => {
    if (!customOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCustomOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCustomOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [customOpen]);

  const customLabel =
    preset === "custom" && customStart && customEnd
      ? `${formatDateShort(customStart)} – ${formatDateShort(customEnd)}`
      : "Custom";

  function handleCancel() {
    setStart(customStart ?? "");
    setEnd(customEnd ?? "");
    setCustomOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex justify-end">
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

      {customOpen && (
        <div
          role="dialog"
          aria-label="Custom date range"
          className="panel absolute right-0 top-full z-20 mt-2 w-[min(34rem,calc(100vw-2rem))] space-y-3 p-4 shadow-lg"
        >
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {start ? formatDateShort(start) : "Start"} – {end ? formatDateShort(end) : "End"}
            </span>
          </div>
          <CalendarPicker
            start={start || null}
            end={end || null}
            maxDate={today}
            onChange={(s, e) => {
              setStart(s);
              setEnd(e);
              // A range is complete as soon as both ends are picked (or a
              // single day is picked twice) - commit and close immediately
              // instead of making the user find a separate Apply button.
              if (s && e) {
                setCustomRange(s, e);
                setCustomOpen(false);
              }
            }}
          />
          <div className="flex justify-end border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
