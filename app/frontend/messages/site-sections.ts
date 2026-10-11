import type { Locale } from "@/lib/i18n";
import siteEn from "./site/site/en.json";
import docsEn from "./site/docs/en.json";
import legalEn from "./site/legal/en.json";

export const SITE_SECTIONS_EN: Record<string, unknown>[] = [siteEn, docsEn, legalEn];

export const SITE_SECTIONS_LOADERS: Record<Exclude<Locale, "en">, () => Promise<Record<string, unknown>[]>> = {
  ar: () => Promise.all([import("./site/site/ar.json"), import("./site/docs/ar.json"), import("./site/legal/ar.json")]).then((ms) => ms.map((m) => m.default)),
  ru: () => Promise.all([import("./site/site/ru.json"), import("./site/docs/ru.json"), import("./site/legal/ru.json")]).then((ms) => ms.map((m) => m.default)),
  zh: () => Promise.all([import("./site/site/zh.json"), import("./site/docs/zh.json"), import("./site/legal/zh.json")]).then((ms) => ms.map((m) => m.default)),
  de: () => Promise.all([import("./site/site/de.json"), import("./site/docs/de.json"), import("./site/legal/de.json")]).then((ms) => ms.map((m) => m.default)),
  es: () => Promise.all([import("./site/site/es.json"), import("./site/docs/es.json"), import("./site/legal/es.json")]).then((ms) => ms.map((m) => m.default)),
  fr: () => Promise.all([import("./site/site/fr.json"), import("./site/docs/fr.json"), import("./site/legal/fr.json")]).then((ms) => ms.map((m) => m.default)),
  ur: () => Promise.all([import("./site/site/ur.json"), import("./site/docs/ur.json"), import("./site/legal/ur.json")]).then((ms) => ms.map((m) => m.default)),
};
