/**
 * Quick-pick color shortcuts shown alongside the custom color picker for
 * folder/file card styling. The encrypted `style.color` value is a raw hex
 * CSS color, not one of these keys — these are shortcuts into the picker,
 * not the exhaustive set of choices.
 */
export interface StyleColorPreset {
  key: string;
  label: string;
  /** CSS color (hex). */
  value: string;
}

export const STYLE_COLOR_PRESETS: StyleColorPreset[] = [
  { key: "red", label: "Red", value: "#ef4444" },
  { key: "orange", label: "Orange", value: "#f97316" },
  { key: "amber", label: "Amber", value: "#f59e0b" },
  { key: "yellow", label: "Yellow", value: "#eab308" },
  { key: "green", label: "Green", value: "#22c55e" },
  { key: "teal", label: "Teal", value: "#14b8a6" },
  { key: "blue", label: "Blue", value: "#3b82f6" },
  { key: "indigo", label: "Indigo", value: "#6366f1" },
  { key: "purple", label: "Purple", value: "#a855f7" },
  { key: "pink", label: "Pink", value: "#ec4899" },
];
