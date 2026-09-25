// Inline SVG marks shared by the four prototypes. Strings, so pages can drop
// them into innerHTML or template literals. All use currentColor except the
// logo, which carries its own two brand blues.

export const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <rect x="5" y="6" width="16" height="16" rx="4" fill="#008a97" transform="rotate(-4 13 14)"/>
  <rect x="11" y="10" width="16" height="16" rx="4" fill="#00d5e4" transform="rotate(-2 19 18)"/>
  <text x="19" y="22.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" fill="#09090b">z</text>
</svg>`;

export const GITHUB = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>`;

export const GITLAB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 13.29-3.33-10a.42.42 0 0 0-.14-.18.38.38 0 0 0-.22-.11.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18l-2.26 6.67H8.32L6.1 3.26a.42.42 0 0 0-.1-.18.38.38 0 0 0-.26-.08.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18L2 13.29a.74.74 0 0 0 .27.83L12 21l9.69-6.88a.71.71 0 0 0 .31-.83Z"/></svg>`;

export const HUGGINGFACE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><path d="M8.5 14.5c.5 1.5 1.8 2.5 3.5 2.5s3-1 3.5-2.5"/></svg>`;

export const TELEGRAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.2 4.4 2.4 10.8c-.6.2-.6 1.1 0 1.3l4.6 1.7 1.8 5.6c.1.4.7.5.9.2l2.6-3.1 4.5 3.3c.5.3 1.1 0 1.2-.5L21.9 5.3c.2-.7-.4-1.2-.7-.9Z"/><path d="m7 13.8 9.4-7"/></svg>`;

export const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none"/></svg>`;

export const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

export const PLATFORMS = [
  { key: "github", label: "GitHub", svg: GITHUB },
  { key: "gitlab", label: "GitLab", svg: GITLAB },
  { key: "huggingface", label: "Hugging Face", svg: HUGGINGFACE },
  { key: "telegram", label: "Telegram", svg: TELEGRAM },
];

// Deterministic hex glyph, same as components/marketing/preview/gsap.ts.
export function hexChar(seed) {
  const x = ((seed * 2654435761) >>> 0) % 16;
  return "0123456789abcdef"[x];
}

export function hexString(len, seed = 0) {
  let s = "";
  for (let i = 0; i < len; i++) s += hexChar(seed + i);
  return s;
}
