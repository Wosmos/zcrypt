/**
 * Ambient full-canvas background treatments for a Custom theme's app shell.
 *
 * These are DISTINCT from folder/file card backgrounds (lib/background-presets.ts).
 * The app shell is a floating-panel layout: opaque sidebar and content panels
 * sit ON TOP of this layer, so it reads as the frame around the panels (and is
 * hidden behind the edge-to-edge panel on mobile). Text never sits on it.
 *
 * Each value is a full CSS `background` shorthand. Every color comes from the
 * LIVE theme vars, so one string follows the user's accent and works in light
 * and dark: `--color-accent` drives the color, `--color-text` the structure,
 * and the secondary hues are the accent mixed toward violet / warm in OKLCH,
 * so they stay in harmony with whatever accent was picked. The last layer is
 * always `var(--color-bg)`.
 */
export interface AppBackground {
  key: string;
  label: string;
  /** Full CSS `background` shorthand value. */
  css: string;
}

const accent = (p: number) => `color-mix(in oklab, var(--color-accent) ${p}%, transparent)`;
const ink = (p: number) => `color-mix(in oklab, var(--color-text) ${p}%, transparent)`;
const violet = (p: number) =>
  `color-mix(in oklab, color-mix(in oklch, var(--color-accent) 40%, oklch(0.62 0.24 300)) ${p}%, transparent)`;
const warm = (p: number) =>
  `color-mix(in oklab, color-mix(in oklch, var(--color-accent) 35%, oklch(0.74 0.17 55)) ${p}%, transparent)`;
const BASE = "var(--color-bg)";

const layers = (...parts: string[]) => [...parts, BASE].join(", ");

export const APP_BACKGROUNDS: AppBackground[] = [
  {
    key: "nebula",
    label: "Nebula",
    css: layers(
      `radial-gradient(42% 55% at 8% 12%, ${accent(42)} 0%, transparent 70%)`,
      `radial-gradient(38% 50% at 92% 18%, ${violet(38)} 0%, transparent 70%)`,
      `radial-gradient(50% 45% at 70% 105%, ${warm(26)} 0%, transparent 72%)`,
      `radial-gradient(30% 35% at 30% 95%, ${violet(22)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "horizon",
    label: "Horizon",
    css: layers(
      `linear-gradient(to bottom, ${BASE} 52%, transparent 78%)`,
      `repeating-linear-gradient(to bottom, ${accent(34)} 0 1px, transparent 1px 34px)`,
      `repeating-linear-gradient(to right, ${accent(26)} 0 1px, transparent 1px 64px)`,
      `radial-gradient(70% 40% at 50% 62%, ${violet(40)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "beams",
    label: "Beams",
    css: layers(
      `linear-gradient(to bottom, transparent 55%, ${BASE} 100%)`,
      `repeating-conic-gradient(from 180deg at 50% -10%, ${accent(26)} 0deg 3deg, transparent 3deg 12deg)`,
      `radial-gradient(60% 50% at 50% 0%, ${accent(30)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "topo",
    label: "Topographic",
    css: layers(
      `repeating-radial-gradient(ellipse 120% 80% at 15% 20%, transparent 0 18px, ${accent(30)} 18px 19.5px, transparent 19.5px 36px)`,
      `repeating-radial-gradient(ellipse 90% 120% at 90% 85%, transparent 0 22px, ${violet(24)} 22px 23.5px, transparent 23.5px 44px)`,
    ),
  },
  {
    key: "prism",
    label: "Prism",
    css: layers(
      `conic-gradient(from 210deg at 50% 50%, ${accent(40)}, ${violet(40)}, ${warm(34)}, ${accent(40)})`,
    ),
  },
  {
    key: "orbit",
    label: "Orbit",
    css: layers(
      `repeating-radial-gradient(circle at 50% 50%, transparent 0 46px, ${ink(10)} 46px 47px, transparent 47px 92px)`,
      `radial-gradient(circle at 50% 50%, ${accent(34)} 0%, transparent 38%)`,
      `radial-gradient(circle at 85% 15%, ${violet(30)} 0 3px, transparent 4px)`,
    ),
  },
  {
    key: "isometric",
    label: "Isometric",
    css: layers(
      `linear-gradient(30deg, ${ink(10)} 12%, transparent 12.5%, transparent 87%, ${ink(10)} 87.5%) 0 0 / 40px 70px`,
      `linear-gradient(150deg, ${ink(10)} 12%, transparent 12.5%, transparent 87%, ${ink(10)} 87.5%) 0 0 / 40px 70px`,
      `linear-gradient(30deg, ${ink(10)} 12%, transparent 12.5%, transparent 87%, ${ink(10)} 87.5%) 20px 35px / 40px 70px`,
      `linear-gradient(150deg, ${ink(10)} 12%, transparent 12.5%, transparent 87%, ${ink(10)} 87.5%) 20px 35px / 40px 70px`,
      `radial-gradient(70% 60% at 0% 0%, ${accent(28)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "carbon",
    label: "Carbon",
    css: layers(
      `radial-gradient(90% 70% at 100% 0%, ${accent(28)} 0%, transparent 65%)`,
      `repeating-linear-gradient(45deg, ${ink(9)} 0 2px, transparent 2px 6px)`,
      `repeating-linear-gradient(-45deg, ${ink(6)} 0 2px, transparent 2px 6px)`,
    ),
  },
  {
    key: "sunset",
    label: "Sunset",
    css: layers(
      `radial-gradient(120% 70% at 50% 120%, ${warm(48)} 0%, ${violet(30)} 35%, transparent 70%)`,
      `radial-gradient(50% 40% at 50% 100%, ${accent(30)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "matrix",
    label: "Matrix",
    css: layers(
      `linear-gradient(to bottom, transparent 40%, ${BASE} 100%)`,
      `repeating-linear-gradient(to right, ${accent(30)} 0 2px, transparent 2px 14px, ${accent(14)} 14px 15px, transparent 15px 26px)`,
      `repeating-linear-gradient(to bottom, transparent 0 6px, ${BASE} 6px 9px)`,
    ),
  },
  {
    key: "checker",
    label: "Checker",
    css: layers(
      `conic-gradient(${ink(9)} 25%, transparent 0 50%, ${ink(9)} 0 75%, transparent 0) 0 0 / 36px 36px`,
      `radial-gradient(60% 60% at 50% 50%, ${accent(24)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "spotlight",
    label: "Spotlight",
    css: layers(
      `radial-gradient(45% 60% at 0% 0%, ${accent(55)} 0%, transparent 70%)`,
      `radial-gradient(40% 55% at 100% 100%, ${violet(36)} 0%, transparent 70%)`,
    ),
  },
  {
    key: "mesh",
    label: "Mesh",
    css: layers(
      `radial-gradient(60% 60% at 12% 0%, ${accent(36)} 0%, transparent 60%)`,
      `radial-gradient(55% 55% at 100% 26%, ${violet(28)} 0%, transparent 58%)`,
      `radial-gradient(48% 48% at 62% 108%, ${warm(22)} 0%, transparent 56%)`,
    ),
  },
  {
    key: "aurora",
    label: "Aurora",
    css: layers(
      `linear-gradient(125deg, ${accent(34)} 0%, transparent 36%, transparent 60%, ${violet(28)} 100%)`,
      `linear-gradient(200deg, transparent 40%, ${warm(14)} 100%)`,
    ),
  },
  {
    key: "glow",
    label: "Glow",
    css: layers(`radial-gradient(95% 65% at 50% -18%, ${accent(34)} 0%, transparent 72%)`),
  },
  {
    key: "rings",
    label: "Rings",
    css: layers(
      `repeating-radial-gradient(circle at 100% 0%, transparent 0 13px, ${accent(26)} 13px 15px, transparent 15px 28px)`,
    ),
  },
  {
    key: "dots",
    label: "Dots",
    css: `radial-gradient(circle at 1px 1px, ${ink(17)} 1.4px, transparent 0) 0 0 / 22px 22px, ${BASE}`,
  },
  {
    key: "grid",
    label: "Grid",
    css: `linear-gradient(${ink(12)} 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, ${ink(12)} 1px, transparent 1px) 0 0 / 26px 26px, ${BASE}`,
  },
  {
    key: "hatch",
    label: "Hatch",
    css: layers(`repeating-linear-gradient(45deg, ${ink(11)} 0 1px, transparent 1px 11px)`),
  },
];

const APP_BG_BY_KEY = new Map(APP_BACKGROUNDS.map((bg) => [bg.key, bg.css]));

/** Resolve a stored app-background key back to its CSS `background` shorthand. */
export function getAppBackgroundByKey(key: string): string | null {
  return APP_BG_BY_KEY.get(key) ?? null;
}
