import { getAppBackgroundByKey } from "@/lib/app-backgrounds";
import { contrastRatio, hexToOklch, luminance, oklchToHex } from "@/lib/color";

/**
 * A user-defined color theme: just two picked colors (accent + canvas), plus
 * an optional decorative background design layered behind the app shell. The
 * rest of the `--t-*` palette (surfaces, borders, sidebar, text) is derived
 * from these two via CSS `color-mix` at apply time: see
 * `applyCustomThemeVars`: the same way every preset in `lib/themes.ts`
 * derives its own full palette from a small base set.
 */
export interface CustomThemeValues {
  accent: string;
  bg: string;
  /** An `APP_BACKGROUNDS` key (see lib/app-backgrounds.ts), or unset for a
   *  flat canvas. These are the ambient full-canvas treatments: distinct from
   *  the folder-card backgrounds in lib/background-presets.ts. */
  background?: string;
  /** Build the opposite light/dark version from these colors when the app is
   *  in the other mode. Unset means on. */
  adapt?: boolean;
}

export type ThemeMode = "light" | "dark";

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
        ...(parsed.adapt === false && { adapt: false }),
      };
    }
  } catch {
    // Corrupt/foreign value: fall through to the default.
  }
  return DEFAULT_CUSTOM_THEME;
}

export function saveCustomTheme(values: CustomThemeValues) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

/** The mode a custom palette was designed in, read from its canvas: a canvas
 *  above mid-grey (WCAG luminance 0.18, OKLCH lightness about 0.6) is light. */
export function designedMode(values: CustomThemeValues): ThemeMode {
  return luminance(values.bg) > 0.18 ? "light" : "dark";
}

const MIN_ACCENT_CONTRAST = 3;

/** Mirror a canvas into the other mode. Hue stays the user's; lightness moves
 *  into the band real light/dark UIs live in (light canvases near-white,
 *  dark ones deep but not pure black), and chroma is capped, since a saturated
 *  canvas reads as loud in light mode and muddy in dark. */
function flipCanvas(bg: string, to: ThemeMode): string {
  const { l, c, h } = hexToOklch(bg);
  if (to === "light") {
    return oklchToHex({
      l: Math.min(0.99, Math.max(0.94, 0.985 - (l - 0.1) * 0.15)),
      c: Math.min(c * 0.5, 0.03),
      h,
    });
  }
  return oklchToHex({
    l: Math.min(0.24, Math.max(0.12, 0.13 + (1 - l) * 0.5)),
    c: Math.min(c * 1.2 + 0.01, 0.05),
    h,
  });
}

/** Keep the accent's hue and chroma, and walk its lightness away from the
 *  canvas until it reaches WCAG's 3:1 minimum for UI components. An accent
 *  that already passes is left exactly as picked. */
function fitAccent(accent: string, bg: string, to: ThemeMode): string {
  if (contrastRatio(accent, bg) >= MIN_ACCENT_CONTRAST) return accent;
  const start = hexToOklch(accent);
  const step = to === "light" ? -0.02 : 0.02;
  for (let l = start.l; l > 0 && l < 1; l += step) {
    const candidate = oklchToHex({ ...start, l });
    if (contrastRatio(candidate, bg) >= MIN_ACCENT_CONTRAST) return candidate;
  }
  return to === "light" ? "#1a1a1a" : "#f5f5f5";
}

/** The colors to use for `mode`: the user's own in the mode they designed
 *  for (or always, with adapt off), the mirrored palette in the other one. */
export function paletteFor(
  values: CustomThemeValues,
  mode: ThemeMode,
): { accent: string; bg: string } {
  if (values.adapt === false || designedMode(values) === mode) {
    return { accent: values.accent, bg: values.bg };
  }
  const bg = flipCanvas(values.bg, mode);
  return { accent: fitAccent(values.accent, bg, mode), bg };
}

/** The resolved light/dark mode currently on <html>. */
export function currentMode(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
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
 *  Inline styles win over any CSS-block value, so `clearCustomThemeVars` MUST
 *  run before switching to a preset/default theme or these would stick. */
export function applyCustomThemeVars(stored: CustomThemeValues, mode: ThemeMode = currentMode()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const values = { ...stored, ...paletteFor(stored, mode) };
  const fg = luminance(values.bg) > 0.5 ? "#161a2b" : "#f0f2f8";
  const accentFg = luminance(values.accent) > 0.5 ? "#161a2b" : "#ffffff";
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
