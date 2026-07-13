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

export const SURFACE_STYLES: SurfaceStyle[] = [
  { id: "default", label: "Default", description: "Clean, soft cards — the standard zcrypt look." },
  { id: "brutalist", label: "Brutalist", description: "Hard edges, thick borders, blocky offset shadows." },
  { id: "claymorphism", label: "Claymorphism", description: "Big rounded, inflated, puffy clay surfaces." },
  { id: "neumorphism", label: "Neumorphic", description: "Soft monochrome extruded shapes." },
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
