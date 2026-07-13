import { getAppBackgroundByKey } from "@/lib/app-backgrounds";

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
  /** Canvas color used in LIGHT mode. */
  bgLight: string;
  /** Canvas color used in DARK mode. A custom theme now carries both so it
   *  actually follows the light/dark toggle instead of freezing one canvas. */
  bgDark: string;
  /** An `APP_BACKGROUNDS` key (see lib/app-backgrounds.ts), or unset for a
   *  flat canvas. These are the ambient full-canvas treatments — distinct from
   *  the folder-card backgrounds in lib/background-presets.ts. */
  background?: string;
}

export const DEFAULT_CUSTOM_THEME: CustomThemeValues = {
  accent: "#3b82f6",
  bgLight: "#eceef2",
  bgDark: "#12141f",
};

const STORAGE_KEY = "zcrypt-custom-theme";

export function loadCustomTheme(): CustomThemeValues {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_THEME;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.accent !== "string") return DEFAULT_CUSTOM_THEME;
    const background = typeof parsed.background === "string" ? parsed.background : undefined;
    // Current shape: separate light/dark canvases.
    if (typeof parsed.bgLight === "string" && typeof parsed.bgDark === "string") {
      return { accent: parsed.accent, bgLight: parsed.bgLight, bgDark: parsed.bgDark, background };
    }
    // Legacy shape: a single `bg` (was applied in both modes). Treat it as the
    // dark canvas and pair it with the default light canvas.
    if (typeof parsed.bg === "string") {
      return { accent: parsed.accent, bgLight: DEFAULT_CUSTOM_THEME.bgLight, bgDark: parsed.bg, background };
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
  "--app-bg",
];

/** Apply a custom theme's derived `--t-*` vars (consumed by the shared
 *  derivation block in globals.css, `html[data-app][data-theme]`) plus the
 *  decorative `--app-bg` layer, directly on `<html>` as inline styles.
 *  `isDark` selects the light or dark canvas, so the custom theme follows the
 *  light/dark toggle (re-applied by ThemeProvider when the mode flips).
 *  Inline styles win over any CSS-block value, so `clearCustomThemeVars` MUST
 *  run before switching to a preset/default theme or these would stick. */
export function applyCustomThemeVars(values: CustomThemeValues, isDark = true) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const canvas = isDark ? values.bgDark : values.bgLight;
  const fg = hexLuminance(canvas) > 0.5 ? "#161a2b" : "#f0f2f8";
  const accentFg = hexLuminance(values.accent) > 0.5 ? "#161a2b" : "#ffffff";
  root.setProperty("--t-bg", canvas);
  root.setProperty("--t-card", `color-mix(in oklab, ${canvas} 90%, white)`);
  root.setProperty("--t-primary", values.accent);
  root.setProperty("--t-primary-fg", accentFg);
  root.setProperty("--t-fg", fg);
  root.setProperty("--t-muted-fg", `color-mix(in oklab, ${fg} 60%, ${canvas})`);
  root.setProperty("--t-border", `color-mix(in oklab, ${canvas} 85%, ${fg})`);
  root.setProperty("--t-sidebar", canvas);
  root.setProperty("--t-sidebar-fg", fg);
  root.setProperty("--t-sidebar-border", `color-mix(in oklab, ${canvas} 85%, ${fg})`);
  // Full `background` shorthand (pattern + `var(--color-bg)` base). When no
  // design is picked, fall back to a plain canvas fill so the shell always has
  // an explicit background.
  const bg = values.background ? getAppBackgroundByKey(values.background) : null;
  root.setProperty("--app-bg", bg ?? "var(--color-bg)");
}

export function clearCustomThemeVars() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const key of CUSTOM_VAR_KEYS) root.removeProperty(key);
}
