import { createTranslator } from "next-intl";
import appEn from "@/messages/sections/app/en.json";
import { DEFAULT_LOCALE, documentLocale, mergeMessages, type Locale } from "@/lib/i18n";

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

type Translator = (k: string, v?: Values) => string;
const translators = new WeakMap<Catalog, Translator>();
const catalogs = new Map<Locale, Catalog>([[DEFAULT_LOCALE, appEn as Catalog]]);

function ensureCatalog(locale: Locale) {
  if (locale === DEFAULT_LOCALE || catalogs.has(locale)) return;
  void loaders[locale as Exclude<Locale, "en">]()
    .then((m) => {
      catalogs.set(locale, mergeMessages(appEn as Catalog, m.default));
    })
    .catch(() => {});
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    ensureCatalog(documentLocale());
    new MutationObserver(() => ensureCatalog(documentLocale())).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  }, 0);
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
  const messages = (catalogs.get(locale) ?? appEn) as Catalog;
  let cached = translators.get(messages);
  if (!cached) {
    cached = createTranslator({
      locale: ready ? locale : DEFAULT_LOCALE,
      messages,
      namespace: "app",
    } as never) as unknown as Translator;
    translators.set(messages, cached);
  }
  return cached(key, values);
}
