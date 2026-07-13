/**
 * Ambient full-canvas background treatments for a Custom theme's app shell.
 *
 * These are deliberately DISTINCT from folder/file card backgrounds (see
 * lib/background-presets.ts). The app shell is a floating-panel layout — opaque
 * sidebar + content cards sit ON TOP of this layer, separated by only a small
 * gap/padding — so the background is seen mostly as a thin ambient FRAME around
 * the panels (and is hidden entirely behind the edge-to-edge panel on mobile).
 * Loud, card-scale gradients look broken at that scale, so every design here is
 * restrained: fine grids, dot matrices, soft accent glows, gentle aurora.
 *
 * Each value is a full CSS `background` shorthand usable as
 * `style={{ background }}`. The pattern ink is derived from the LIVE theme vars
 * (`--color-text` for structure, `--color-accent` for color) via
 * `color-mix(... transparent)`, so a single string adapts to both light and
 * dark and follows the user's chosen accent. The final comma layer is always
 * `var(--color-bg)` so the canvas color shows through beneath the pattern.
 *
 * Ordered most-neutral to most-expressive.
 */
export interface AppBackground {
  key: string;
  label: string;
  /** Full CSS `background` shorthand value. */
  css: string;
}

export const APP_BACKGROUNDS: AppBackground[] = [
  {
    key: "glow",
    label: "Glow",
    // A soft wash of accent from the top edge — the most restrained option.
    // Warms the frame without any structure.
    css: "radial-gradient(95% 65% at 50% -18%, color-mix(in oklab, var(--color-accent) 30%, transparent) 0%, transparent 72%), var(--color-bg)",
  },
  {
    key: "dots",
    label: "Dots",
    // Fine dot matrix in the text ink — neutral, technical, tiles cleanly.
    // 17% so it stays legible as dark-on-light in the thin shell frame.
    css: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--color-text) 17%, transparent) 1.4px, transparent 0) 0 0 / 22px 22px, var(--color-bg)",
  },
  {
    key: "grid",
    label: "Grid",
    // Thin crosshatch line grid — blueprint/graph-paper feel.
    css: "linear-gradient(color-mix(in oklab, var(--color-text) 12%, transparent) 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, color-mix(in oklab, var(--color-text) 12%, transparent) 1px, transparent 1px) 0 0 / 26px 26px, var(--color-bg)",
  },
  {
    key: "hatch",
    label: "Hatch",
    // Diagonal weave — softer and more textile than the straight grid.
    css: "repeating-linear-gradient(45deg, color-mix(in oklab, var(--color-text) 11%, transparent) 0 1px, transparent 1px 11px), var(--color-bg)",
  },
  {
    key: "rings",
    label: "Rings",
    // Concentric accent arcs radiating from the top-right corner — echoes the
    // avatar/logo motif without competing with content.
    css: "repeating-radial-gradient(circle at 100% 0%, transparent 0 13px, color-mix(in oklab, var(--color-accent) 24%, transparent) 13px 15px, transparent 15px 28px), var(--color-bg)",
  },
  {
    key: "aurora",
    label: "Aurora",
    // Two diagonal accent bands sweeping opposite corners — soft motion, no
    // hard gradient line.
    css: "linear-gradient(125deg, color-mix(in oklab, var(--color-accent) 26%, transparent) 0%, transparent 38%, transparent 62%, color-mix(in oklab, var(--color-accent) 18%, transparent) 100%), var(--color-bg)",
  },
  {
    key: "mesh",
    label: "Mesh",
    // Three accent glows anchored to different edges — the most colorful of the
    // set, an ambient "gradient mesh" that still never overpowers.
    css: "radial-gradient(60% 60% at 12% 0%, color-mix(in oklab, var(--color-accent) 30%, transparent) 0%, transparent 60%), radial-gradient(55% 55% at 100% 26%, color-mix(in oklab, var(--color-accent) 20%, transparent) 0%, transparent 58%), radial-gradient(48% 48% at 62% 108%, color-mix(in oklab, var(--color-accent) 16%, transparent) 0%, transparent 56%), var(--color-bg)",
  },
];

const APP_BG_BY_KEY = new Map(APP_BACKGROUNDS.map((bg) => [bg.key, bg.css]));

/** Resolve a stored app-background key back to its CSS `background` shorthand. */
export function getAppBackgroundByKey(key: string): string | null {
  return APP_BG_BY_KEY.get(key) ?? null;
}
