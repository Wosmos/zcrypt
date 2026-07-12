import { getBackgroundByKey } from "@/lib/background-presets";

/**
 * A user-defined color theme: just two picked colors (accent + canvas), plus
 * an optional decorative background design layered behind the app shell. The
 * rest of the `--t-*` palette (surfaces, borders, sidebar, text) is derived
 * from these two via CSS `color-mix` at apply time — see
 * `applyCustomThemeVars` — the same way every preset in `lib/themes.ts`
 * derives its own full palette from a small base set.
 */
export interface CustomThemeValues {
  accent: string;
  bg: string;
  /** A `BACKGROUND_DESIGNS` key (see lib/background-presets.ts), or unset for
   *  a flat canvas. */
  background?: string;
}

export const DEFAULT_CUSTOM_THEME: CustomThemeValues = {
  accent: "#3b82f6",
  bg: "#12141f",
};

const STORAGE_KEY = "zcrypt-custom-theme";

export function loadCustomTheme(): CustomThemeValues {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_THEME;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.accent === "string" && typeof parsed?.bg === "string") {
      return {
        accent: parsed.accent,
        bg: parsed.bg,
        background: typeof parsed.background === "string" ? parsed.background : undefined,
      };
    }
  } catch {
    // Corrupt/foreign value — fall through to the default.
  }
  return DEFAULT_CUSTOM_THEME;
}

export function saveCustomTheme(values: CustomThemeValues) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

/** Relative luminance (WCAG formula) — used to pick a readable near-black or
 *  near-white text color for whatever bg/accent the user lands on, so a
 *  two-color custom theme can never produce illegible text. */
function hexLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const CUSTOM_VAR_KEYS = [
  "--t-bg",
  "--t-card",
  "--t-primary",
  "--t-primary-fg",
  "--t-fg",
  "--t-muted-fg",
  "--t-border",
  "--t-sidebar",
  "--t-sidebar-fg",
  "--t-sidebar-border",
  "--app-bg-image",
];

/** Apply a custom theme's derived `--t-*` vars (consumed by the shared
 *  derivation block in globals.css, `html[data-app][data-theme]`) plus the
 *  decorative `--app-bg-image` layer, directly on `<html>` as inline styles.
 *  Inline styles win over any CSS-block value, so `clearCustomThemeVars` MUST
 *  run before switching to a preset/default theme or these would stick. */
export function applyCustomThemeVars(values: CustomThemeValues) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const fg = hexLuminance(values.bg) > 0.5 ? "#161a2b" : "#f0f2f8";
  const accentFg = hexLuminance(values.accent) > 0.5 ? "#161a2b" : "#ffffff";
  root.setProperty("--t-bg", values.bg);
  root.setProperty("--t-card", `color-mix(in oklab, ${values.bg} 90%, white)`);
  root.setProperty("--t-primary", values.accent);
  root.setProperty("--t-primary-fg", accentFg);
  root.setProperty("--t-fg", fg);
  root.setProperty("--t-muted-fg", `color-mix(in oklab, ${fg} 60%, ${values.bg})`);
  root.setProperty("--t-border", `color-mix(in oklab, ${values.bg} 85%, ${fg})`);
  root.setProperty("--t-sidebar", values.bg);
  root.setProperty("--t-sidebar-fg", fg);
  root.setProperty("--t-sidebar-border", `color-mix(in oklab, ${values.bg} 85%, ${fg})`);
  const bgImage = values.background ? getBackgroundByKey(values.background) : null;
  root.setProperty("--app-bg-image", bgImage ?? "none");
}

export function clearCustomThemeVars() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const key of CUSTOM_VAR_KEYS) root.removeProperty(key);
}
