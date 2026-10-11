import { createTranslator } from "next-intl";
import appEn from "@/messages/sections/app/en.json";
import { DEFAULT_LOCALE, isLocale, mergeMessages, type Locale } from "@/lib/i18n";

type Values = Record<string, string | number>;
type Catalog = Record<string, unknown>;

const loaders: Record<Exclude<Locale, "en">, () => Promise<{ default: Catalog }>> = {
  ar: () => import("@/messages/sections/app/ar.json"),
  ru: () => import("@/messages/sections/app/ru.json"),
  zh: () => import("@/messages/sections/app/zh.json"),
  de: () => import("@/messages/sections/app/de.json"),
  es: () => import("@/messages/sections/app/es.json"),
  fr: () => import("@/messages/sections/app/fr.json"),
  ur: () => import("@/messages/sections/app/ur.json"),
};

const catalogs = new Map<Locale, Catalog>([[DEFAULT_LOCALE, appEn as Catalog]]);

function documentLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const base = document.documentElement.lang.toLowerCase().split("-")[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

function ensureCatalog(locale: Locale) {
  if (locale === DEFAULT_LOCALE || catalogs.has(locale)) return;
  void loaders[locale]()
    .then((m) => {
      catalogs.set(locale, mergeMessages(appEn as Catalog, m.default));
    })
    .catch(() => {});
}

if (typeof document !== "undefined") {
  ensureCatalog(documentLocale());
  new MutationObserver(() => ensureCatalog(documentLocale())).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
}

/**
 * Translate a string from the "app" namespace outside React (stores, toasts,
 * module-level helpers). Reads the active locale from <html lang>, falls back
 * to English until that locale's catalog has loaded.
 */
export function tr(key: string, values?: Values): string {
  const locale = documentLocale();
  ensureCatalog(locale);
  const ready = catalogs.has(locale);
  const translator = createTranslator({
    locale: ready ? locale : DEFAULT_LOCALE,
    messages: (catalogs.get(locale) ?? appEn) as Catalog,
    namespace: "app",
  } as never) as unknown as (k: string, v?: Values) => string;
  return translator(key, values);
}
