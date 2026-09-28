"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
 * upload-chart.tsx used to own locally. Custom opens a small themed Popover
 * anchored to the pill with a from-scratch calendar (components/ui/calendar.tsx,
 * no date library) - Popover already handles outside-click/Escape/positioning.
 */
export function DateRangeControl() {
  const { preset, customStart, customEnd, setPreset, setCustomRange } = useAnalyticsFiltersStore();
  const [customOpen, setCustomOpen] = useState(false);

  const today = localDateKey(new Date());
  const [start, setStart] = useState(customStart ?? "");
  const [end, setEnd] = useState(customEnd ?? "");

  const customLabel =
    preset === "custom" && customStart && customEnd
      ? `${formatDateShort(customStart)} – ${formatDateShort(customEnd)}`
      : "Custom";

  function handleOpenChange(open: boolean) {
    if (open) {
      setCustomOpen(true);
      return;
    }
    setStart(customStart ?? "");
    setEnd(customEnd ?? "");
    setCustomOpen(false);
  }

  return (
    <div className="flex justify-end">
      <Popover open={customOpen} onOpenChange={handleOpenChange}>
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
          <PopoverAnchor asChild>
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
          </PopoverAnchor>
        </ToggleGroup>

        <PopoverContent align="end" className="w-[min(34rem,calc(100vw-2rem))] space-y-3 p-4">
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
              if (s && e) {
                setCustomRange(s, e);
                setCustomOpen(false);
              }
            }}
          />
          <div className="flex justify-end border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
