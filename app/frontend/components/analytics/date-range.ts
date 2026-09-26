import type { DateRangePreset } from "@/store/analytics-filters";
import { formatDateShort } from "@/lib/utils";

export type Bucket = "hour" | "day" | "month";

export interface RangeBounds {
  /** null = "all time" (no lower bound at all, not an arbitrary epoch). */
  start: Date | null;
  end: Date;
  allTime: boolean;
  label: string;
  bucket: Bucket;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function bucketForSpan(days: number): Bucket {
  if (days <= 3) return "hour";
  if (days > 400) return "month";
  return "day";
}

/**
 * Resolves a date-range preset (plus optional custom bounds) into concrete
 * start/end Dates, mirroring the backend's own window semantics
 * (`parseAnalyticsWindow` in app/backend/cmd/analytics.go): "all" drops the
 * lower bound entirely rather than picking an arbitrary epoch, and an
 * unresolved "custom" (no dates picked yet) falls back to the same 30-day
 * default the store itself defaults to.
 */
export function getRangeBounds(
  preset: DateRangePreset,
  customStart: string | null,
  customEnd: string | null,
): RangeBounds {
  const end = new Date();

  if (preset === "today") {
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    return { start, end, allTime: false, label: "Today", bucket: "hour" };
  }
  if (preset === "7d") {
    return {
      start: new Date(end.getTime() - 7 * DAY_MS),
      end,
      allTime: false,
      label: "Last 7 days",
      bucket: "day",
    };
  }
  if (preset === "90d") {
    return {
      start: new Date(end.getTime() - 90 * DAY_MS),
      end,
      allTime: false,
      label: "Last 90 days",
      bucket: "day",
    };
  }
  if (preset === "all") {
    return { start: null, end, allTime: true, label: "All time", bucket: "month" };
  }
  if (preset === "custom" && customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00`);
    const customEndDate = new Date(`${customEnd}T23:59:59.999`);
    const days = (customEndDate.getTime() - start.getTime()) / DAY_MS;
    return {
      start,
      end: customEndDate,
      allTime: false,
      label: `${formatDateShort(start)} – ${formatDateShort(customEndDate)}`,
      bucket: bucketForSpan(Math.max(days, 0)),
    };
  }

  return {
    start: new Date(end.getTime() - 30 * DAY_MS),
    end,
    allTime: false,
    label: "Last 30 days",
    bucket: "day",
  };
}
