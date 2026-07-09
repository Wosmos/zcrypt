/**
 * Color-theme registry for the authenticated app (internal pages only).
 *
 * Each theme maps to a `[data-theme="<id>"]` block in globals.css, where ~10
 * base `--t-*` vars (light + dark) are derived into zcrypt's full `--color-*`
 * system. Here we only carry the metadata + a few representative swatch colors
 * the settings picker renders as a live preview. The swatch values are the
 * theme's real accent / background / surface / sidebar colors, so the preview
 * matches what actually applies.
 *
 * `default` is the original zcrypt palette (no `data-theme` attribute set).
 */

interface ThemeSwatch {
  /** Brand / action color (maps to --color-accent). */
  accent: string;
  /** App canvas (maps to --color-bg). */
  bg: string;
  /** Panel / card surface (maps to --color-surface). */
  surface: string;
  /** Sidebar fill (maps to --color-sidebar). */
  sidebar: string;
}

export interface ColorTheme {
  id: string;
  label: string;
  description: string;
  light: ThemeSwatch;
  dark: ThemeSwatch;
}

export const DEFAULT_COLOR_THEME = "default";

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "default",
    label: "zcrypt",
    description: "The signature cyan-on-navy look.",
    light: { accent: "#0093a3", bg: "#eceef2", surface: "#ffffff", sidebar: "#1a1f36" },
    dark: { accent: "#00d5e4", bg: "#090c16", surface: "#13172c", sidebar: "#0e1225" },
  },
  {
    id: "enterprise-blue",
    label: "Enterprise Blue",
    description: "Crisp, corporate, confident blue.",
    light: {
      accent: "oklch(0.5828 0.2188 258.8797)",
      bg: "oklch(0.9946 0.0026 286.3519)",
      surface: "oklch(1 0 0)",
      sidebar: "oklch(0.9946 0.0026 286.3519)",
    },
    dark: {
      accent: "oklch(0.5828 0.2188 258.8797)",
      bg: "oklch(0.1440 0.0028 247.0906)",
      surface: "oklch(0.1899 0.0051 248.0992)",
      sidebar: "oklch(0.1779 0.0064 271.0422)",
    },
  },
  {
    id: "caffeine",
    label: "Caffeine",
    description: "Warm espresso neutrals with a cream pop.",
    light: {
      accent: "oklch(0.4341 0.0392 41.9938)",
      bg: "oklch(0.9821 0 0)",
      surface: "oklch(0.9911 0 0)",
      sidebar: "oklch(0.9881 0 0)",
    },
    dark: {
      accent: "oklch(0.9247 0.0524 66.1732)",
      bg: "oklch(0.1776 0 0)",
      surface: "oklch(0.2134 0 0)",
      sidebar: "oklch(0.2103 0.0059 285.8852)",
    },
  },
  {
    id: "claymorphism",
    label: "Claymorphism",
    description: "Soft clay surfaces and a violet accent.",
    light: {
      accent: "oklch(0.5854 0.2041 277.1173)",
      bg: "oklch(0.9232 0.0026 48.7171)",
      surface: "oklch(0.9699 0.0013 106.4238)",
      sidebar: "oklch(0.8687 0.0043 56.3660)",
    },
    dark: {
      accent: "oklch(0.6801 0.1583 276.9349)",
      bg: "oklch(0.2244 0.0074 67.4370)",
      surface: "oklch(0.2801 0.0080 59.3379)",
      sidebar: "oklch(0.3359 0.0077 59.4197)",
    },
  },
  {
    id: "cosmic-night",
    label: "Cosmic Night",
    description: "Deep indigo with an electric violet glow.",
    light: {
      accent: "oklch(0.5417 0.1790 288.0332)",
      bg: "oklch(0.9730 0.0133 286.1503)",
      surface: "oklch(1 0 0)",
      sidebar: "oklch(0.9580 0.0133 286.1454)",
    },
    dark: {
      accent: "oklch(0.7162 0.1597 290.3962)",
      bg: "oklch(0.1743 0.0227 283.7998)",
      surface: "oklch(0.2284 0.0384 282.9324)",
      sidebar: "oklch(0.2284 0.0384 282.9324)",
    },
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Hot magenta on neon-tinged dark.",
    light: {
      accent: "oklch(0.6726 0.2904 341.4084)",
      bg: "oklch(0.9816 0.0017 247.8390)",
      surface: "oklch(1 0 0)",
      sidebar: "oklch(0.9595 0.0200 286.0164)",
    },
    dark: {
      accent: "oklch(0.6726 0.2904 341.4084)",
      bg: "oklch(0.1649 0.0352 281.8285)",
      surface: "oklch(0.2542 0.0611 281.1423)",
      sidebar: "oklch(0.1649 0.0352 281.8285)",
    },
  },
  {
    id: "elegant-luxury",
    label: "Elegant Luxury",
    description: "Deep crimson and warm paper.",
    light: {
      accent: "oklch(0.4650 0.1470 24.9381)",
      bg: "oklch(0.9779 0.0042 56.3756)",
      surface: "oklch(0.9779 0.0042 56.3756)",
      sidebar: "oklch(0.9431 0.0068 53.4442)",
    },
    dark: {
      accent: "oklch(0.5054 0.1905 27.5181)",
      bg: "oklch(0.2161 0.0061 56.0434)",
      surface: "oklch(0.2685 0.0063 34.2976)",
      sidebar: "oklch(0.2161 0.0061 56.0434)",
    },
  },
  {
    id: "pastel-dreams",
    label: "Pastel Dreams",
    description: "Airy lilac pastels and lavender.",
    light: {
      accent: "oklch(0.7090 0.1592 293.5412)",
      bg: "oklch(0.9689 0.0090 314.7819)",
      surface: "oklch(1 0 0)",
      sidebar: "oklch(0.9073 0.0530 306.0902)",
    },
    dark: {
      accent: "oklch(0.7874 0.1179 295.7538)",
      bg: "oklch(0.2161 0.0061 56.0434)",
      surface: "oklch(0.2805 0.0309 307.2326)",
      sidebar: "oklch(0.3416 0.0444 308.8496)",
    },
  },
  {
    id: "twitter",
    label: "Twitter",
    description: "Clean sky-blue on stark white or OLED black.",
    light: {
      accent: "oklch(0.6723 0.1606 244.9955)",
      bg: "oklch(1 0 0)",
      surface: "oklch(0.9784 0.0011 197.1387)",
      sidebar: "oklch(0.9784 0.0011 197.1387)",
    },
    dark: {
      accent: "oklch(0.6692 0.1607 245.0110)",
      bg: "oklch(0 0 0)",
      surface: "oklch(0.2097 0.0080 274.5332)",
      sidebar: "oklch(0.2097 0.0080 274.5332)",
    },
  },
];

const VALID_IDS = new Set(COLOR_THEMES.map((t) => t.id));

export function isValidColorTheme(id: string | null | undefined): boolean {
  return !!id && VALID_IDS.has(id);
}
