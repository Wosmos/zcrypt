"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { cn, localDateKey as toKey } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Every cell for a month grid: 6 weeks x 7 days, including the muted
 *  lead-in/lead-out days from the adjacent months so the grid stays a full
 *  rectangle regardless of which weekday the month starts on. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

interface MonthPaneProps {
  year: number;
  month: number;
  start: string | null;
  end: string | null;
  max: string;
  todayKey: string;
  onPick: (key: string) => void;
}

function MonthPane({ year, month, start, end, max, todayKey, onPick }: MonthPaneProps) {
  const label = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const days = buildMonthGrid(year, month);

  return (
    <div className="w-[15.5rem]">
      <div className="mb-2 text-center text-sm font-semibold text-[var(--color-text)]">{label}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[11px] font-medium text-[var(--color-text-muted)]">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const key = toKey(d);
          const inMonth = d.getMonth() === month;
          const disabled = key > max;
          // Lead-in/lead-out filler days (e.g. August's tail shown inside
          // September's grid) share a real date key with that day's actual
          // cell in its own month pane, so selection/today state is only
          // ever drawn on the cell that belongs to this pane's own month —
          // otherwise the same date lights up twice across two panes.
          const isStart = inMonth && key === start;
          const isEnd = inMonth && key === end;
          const inRange = inMonth && !!start && !!end && key > start && key < end;
          const isToday = inMonth && key === todayKey;

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(key)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-xs transition-colors",
                !inMonth && "text-[var(--color-text-muted)]/40",
                inMonth && !disabled && "text-[var(--color-text)]",
                disabled && "cursor-not-allowed text-[var(--color-text-muted)]/30",
                inRange && "rounded-none bg-[var(--color-accent)]/15",
                (isStart || isEnd) && "bg-[var(--color-accent)] font-semibold text-white",
                isToday && !isStart && !isEnd && "ring-1 ring-inset ring-[var(--color-accent)]/50",
                !disabled && !isStart && !isEnd && "hover:bg-[var(--color-surface-2)]",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CalendarProps {
  /** Range start (yyyy-mm-dd) or null. */
  start: string | null;
  /** Range end (yyyy-mm-dd) or null. */
  end: string | null;
  /** Called with the new (start, end) after a day is clicked. */
  onChange: (start: string, end: string) => void;
  /** Days after this (yyyy-mm-dd) are disabled. Defaults to today. */
  maxDate?: string;
}

/**
 * A small from-scratch range calendar (no date library) themed with the
 * app's own tokens instead of the browser's native date-input popup. Shows
 * two consecutive months side by side (stacked on narrow viewports) so a
 * range spanning a month boundary doesn't need back-and-forth navigation.
 * Click sets the range start; the next click on a later day sets the end
 * (an earlier click restarts the range from there).
 */
export function Calendar({ start, end, onChange, maxDate }: CalendarProps) {
  const todayKey = toKey(new Date());
  const max = maxDate ?? todayKey;
  const anchor = start ? fromKey(start) : new Date();
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());

  function goMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function handlePick(key: string) {
    // Nothing selected yet, or the previous selection was already a complete
    // range: this click starts a brand-new one (end left unset until the
    // NEXT click, so a two-click range doesn't collapse back into a 1-day
    // pick on the second click).
    if (!start || end) {
      onChange(key, "");
      return;
    }
    // start is set, end isn't: this is the second click, completing the range.
    if (key < start) {
      onChange(key, start);
    } else {
      onChange(start, key);
    }
  }

  const next = new Date(viewYear, viewMonth + 1, 1);
  const nextDisabled = toKey(new Date(viewYear, viewMonth + 1, 1)) > max;

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goMonth(-1)}
          className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goMonth(1)}
          disabled={nextDisabled}
          className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        <MonthPane
          year={viewYear}
          month={viewMonth}
          start={start}
          end={end}
          max={max}
          todayKey={todayKey}
          onPick={handlePick}
        />
        <MonthPane
          year={next.getFullYear()}
          month={next.getMonth()}
          start={start}
          end={end}
          max={max}
          todayKey={todayKey}
          onPick={handlePick}
        />
      </div>

      <div className="mt-3 flex justify-between border-t border-[var(--color-border)] pt-2">
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="text-xs font-medium text-[var(--color-accent)] hover:underline"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            setViewYear(new Date().getFullYear());
            setViewMonth(new Date().getMonth());
            onChange(todayKey, todayKey);
          }}
          className="text-xs font-medium text-[var(--color-accent)] hover:underline"
        >
          Today
        </button>
      </div>
    </div>
  );
}
