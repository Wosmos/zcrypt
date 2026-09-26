import { create } from "zustand";

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "all" | "custom";

const PRESET_KEY = "zcrypt-analytics-range";
const CUSTOM_START_KEY = "zcrypt-analytics-range-start";
const CUSTOM_END_KEY = "zcrypt-analytics-range-end";
const VALID_PRESETS: DateRangePreset[] = ["today", "7d", "30d", "90d", "all", "custom"];

function readPreset(): DateRangePreset {
  if (typeof window === "undefined") return "30d";
  const stored = localStorage.getItem(PRESET_KEY);
  return (VALID_PRESETS as string[]).includes(stored ?? "") ? (stored as DateRangePreset) : "30d";
}

interface AnalyticsFiltersStore {
  /** Default "30d": cheap by default, and doesn't imply the page can casually
   *  show "everything" once a vault is large. */
  preset: DateRangePreset;
  customStart: string | null; // yyyy-mm-dd
  customEnd: string | null; // yyyy-mm-dd
  setPreset: (p: DateRangePreset) => void;
  setCustomRange: (start: string, end: string) => void;
}

export const useAnalyticsFiltersStore = create<AnalyticsFiltersStore>((set) => ({
  preset: readPreset(),
  customStart: typeof window !== "undefined" ? localStorage.getItem(CUSTOM_START_KEY) : null,
  customEnd: typeof window !== "undefined" ? localStorage.getItem(CUSTOM_END_KEY) : null,

  setPreset: (preset) => {
    localStorage.setItem(PRESET_KEY, preset);
    set({ preset });
  },

  setCustomRange: (customStart, customEnd) => {
    localStorage.setItem(PRESET_KEY, "custom");
    localStorage.setItem(CUSTOM_START_KEY, customStart);
    localStorage.setItem(CUSTOM_END_KEY, customEnd);
    set({ preset: "custom", customStart, customEnd });
  },
}));
