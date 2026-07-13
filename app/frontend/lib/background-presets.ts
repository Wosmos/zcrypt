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
  // Distinct hue families + directions so each reads as its own identity. Three
  // outliers keep the set from feeling like one gradient repeated: `cosmic` is
  // a dark radial, `pastel-bloom` is the only pale one, `ember` goes near-black.
  { key: "sunset", label: "Sunset", css: "linear-gradient(135deg, #fb923c 0%, #f43f5e 52%, #a855f7 100%)" },
  { key: "ocean", label: "Ocean", css: "linear-gradient(135deg, #0891b2 0%, #06b6d4 46%, #3b82f6 100%)" },
  { key: "dusk", label: "Dusk", css: "linear-gradient(160deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)" },
  { key: "meadow", label: "Meadow", css: "linear-gradient(135deg, #16a34a 0%, #10b981 52%, #0d9488 100%)" },
  { key: "citrus", label: "Citrus", css: "linear-gradient(120deg, #facc15 0%, #f59e0b 55%, #ea580c 100%)" },
  { key: "cosmic", label: "Cosmic", css: "radial-gradient(circle at 30% 25%, #6366f1 0%, #312e81 46%, #0f0a2e 100%)" },
  { key: "pastel-bloom", label: "Pastel Bloom", css: "linear-gradient(135deg, #fbcfe8 0%, #ddd6fe 48%, #bfdbfe 100%)" },
  { key: "ember", label: "Ember", css: "linear-gradient(140deg, #f87171 0%, #b91c1c 55%, #450a0a 100%)" },
  {
    key: "dot-grid",
    label: "Dot Grid",
    css: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.38) 1px, transparent 0) 0 0/14px 14px, linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)",
  },
  {
    key: "diagonal-stripes",
    label: "Diagonal Stripes",
    css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 12px), linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
  },
];

const BACKGROUND_BY_KEY = new Map(BACKGROUND_DESIGNS.map((design) => [design.key, design.css]));

/** Resolve a stored custom-style background key back to its CSS value. */
export function getBackgroundByKey(key: string): string | null {
  return BACKGROUND_BY_KEY.get(key) ?? null;
}
