/**
 * Curated background designs shown alongside the flat color picker for
 * folder/file card styling. Every value is a self-contained CSS `background`
 * shorthand — gradients and repeating-pattern layers only, no images or
 * network-dependent assets — so it can be applied directly via
 * `style={{ background: design.css }}`.
 */
export interface BackgroundDesign {
  key: string;
  label: string;
  /** CSS `background` shorthand value. */
  css: string;
}

export const BACKGROUND_DESIGNS: BackgroundDesign[] = [
  { key: "sunset", label: "Sunset", css: "linear-gradient(135deg, #f97316 0%, #ec4899 55%, #a855f7 100%)" },
  { key: "ocean", label: "Ocean", css: "linear-gradient(135deg, #0093a3 0%, #00d5e4 100%)" },
  { key: "dusk", label: "Dusk", css: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)" },
  { key: "meadow", label: "Meadow", css: "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)" },
  { key: "citrus", label: "Citrus", css: "linear-gradient(135deg, #eab308 0%, #f97316 100%)" },
  { key: "cosmic", label: "Cosmic", css: "radial-gradient(circle at 30% 30%, #6366f1 0%, #1e1b4b 100%)" },
  { key: "pastel-bloom", label: "Pastel Bloom", css: "linear-gradient(135deg, #fbcfe8 0%, #ddd6fe 50%, #bfdbfe 100%)" },
  { key: "ember", label: "Ember", css: "linear-gradient(135deg, #ef4444 0%, #7c2d12 100%)" },
  {
    key: "dot-grid",
    label: "Dot Grid",
    css: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0) 0 0/16px 16px, linear-gradient(135deg, #0093a3 0%, #00d5e4 100%)",
  },
  {
    key: "diagonal-stripes",
    label: "Diagonal Stripes",
    css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 2px, transparent 2px, transparent 12px), linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
  },
];

const BACKGROUND_BY_KEY = new Map(BACKGROUND_DESIGNS.map((design) => [design.key, design.css]));

/** Resolve a stored custom-style background key back to its CSS value. */
export function getBackgroundByKey(key: string): string | null {
  return BACKGROUND_BY_KEY.get(key) ?? null;
}
