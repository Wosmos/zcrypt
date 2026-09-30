export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "ru", name: "Русский", dir: "ltr" },
  { code: "zh", name: "简体中文", dir: "ltr" },
  { code: "de", name: "Deutsch", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "ur", name: "اردو", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "zcrypt-locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}

export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function detectLocale(): Locale {
  return readStoredLocale() ?? matchLocale(navigator.languages?.length ? navigator.languages : []);
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
  document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function applyDocumentLocale(locale: Locale): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = localeDir(locale);
}

export function mergeMessages<T extends Record<string, unknown>>(
  base: T,
  over: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    out[key] =
      value && typeof value === "object" && current && typeof current === "object"
        ? mergeMessages(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');if(!l){var n=(navigator.languages||[navigator.language||'en']);for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split('-')[0];if(${JSON.stringify(LOCALES.map((x) => x.code))}.indexOf(b)>-1){l=b;break}}}if(l&&l!=='en'){var d=document.documentElement;d.lang=l;d.dir=${JSON.stringify(LOCALES.filter((x) => x.dir === "rtl").map((x) => x.code))}.indexOf(l)>-1?'rtl':'ltr'}}catch(e){}})();`;
