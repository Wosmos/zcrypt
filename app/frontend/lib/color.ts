/**
 * Small color toolkit for user-picked colors: hex <-> OKLCH (perceptual, so
 * lightness edits keep the same hue the user chose) and WCAG contrast. OKLab
 * math follows Björn Ottosson's reference conversion.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function parseHex(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : n;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance of a hex color. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function oklchToLinearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to hex. Out-of-gamut colors keep their lightness and hue and lose
 *  just enough chroma to fit sRGB, the standard CSS Color 4 gamut mapping. */
export function oklchToHex(color: Oklch): string {
  let { c } = color;
  let rgb = oklchToLinearRgb(color);
  for (let i = 0; i < 24 && !inGamut(rgb); i++) {
    c *= 0.85;
    rgb = oklchToLinearRgb({ ...color, c });
  }
  return `#${rgb
    .map((v) =>
      Math.round(clamp01(toGamma(clamp01(v))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
