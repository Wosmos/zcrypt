/**
 * Surface styles — a design-system axis (radius + border + shadow, and the
 * folder silhouette) layered on top of any color theme. Selected per device and
 * applied as `html[data-app][data-surface="<id>"]`; the CSS lives in globals.css
 * (see the "Surface styles" block). "default" removes the attribute so the base
 * look applies untouched.
 */
export interface SurfaceStyle {
  id: string;
  label: string;
  description: string;
}

// Labels are deliberately distinct from the COLOR theme names (a "Claymorphism"
// palette already exists in lib/themes.ts) — this axis is the design language,
// not the palette, and each style also swaps the app's typeface.
export const SURFACE_STYLES: SurfaceStyle[] = [
  { id: "default", label: "Default", description: "Clean, soft cards — the standard zcrypt look." },
  { id: "brutalist", label: "Neo-Brutalist", description: "Hard edges, ink borders, loud accent shadows, grotesque + mono type." },
  { id: "claymorphism", label: "Clay", description: "Inflated, squeezable surfaces, pill buttons, rounded type." },
  { id: "neumorphism", label: "Soft UI", description: "Monochrome extrusion carved from the canvas, soft geometric type." },
];

export const DEFAULT_SURFACE_STYLE = "default";

const IDS = new Set(SURFACE_STYLES.map((s) => s.id));

export function isValidSurfaceStyle(id: unknown): id is string {
  return typeof id === "string" && IDS.has(id);
}

/** Apply (or clear) the `data-surface` attribute on <html>. Scoped by the app
 *  CSS to `html[data-app]`, so it's inert on marketing/auth pages. */
export function applySurfaceStyle(id: string): void {
  if (typeof document === "undefined") return;
  if (isValidSurfaceStyle(id) && id !== DEFAULT_SURFACE_STYLE) {
    document.documentElement.dataset.surface = id;
  } else {
    delete document.documentElement.dataset.surface;
  }
}
