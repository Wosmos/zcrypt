import type { Locale } from "@/lib/i18n";
import appEn from "./sections/app/en.json";
import spacesEn from "./sections/spaces/en.json";
import toolsEn from "./sections/tools/en.json";
import adminEn from "./sections/admin/en.json";
import settingsEn from "./sections/settings/en.json";
import authEn from "./sections/auth/en.json";
import uiEn from "./sections/ui/en.json";

export const APP_SECTIONS_EN: Record<string, unknown>[] = [appEn, spacesEn, toolsEn, adminEn, settingsEn, authEn, uiEn];

export const APP_SECTIONS_LOADERS: Record<Exclude<Locale, "en">, () => Promise<Record<string, unknown>[]>> = {
  ar: () => Promise.all([import("./sections/app/ar.json"), import("./sections/spaces/ar.json"), import("./sections/tools/ar.json"), import("./sections/admin/ar.json"), import("./sections/settings/ar.json"), import("./sections/auth/ar.json"), import("./sections/ui/ar.json")]).then((ms) => ms.map((m) => m.default)),
  ru: () => Promise.all([import("./sections/app/ru.json"), import("./sections/spaces/ru.json"), import("./sections/tools/ru.json"), import("./sections/admin/ru.json"), import("./sections/settings/ru.json"), import("./sections/auth/ru.json"), import("./sections/ui/ru.json")]).then((ms) => ms.map((m) => m.default)),
  zh: () => Promise.all([import("./sections/app/zh.json"), import("./sections/spaces/zh.json"), import("./sections/tools/zh.json"), import("./sections/admin/zh.json"), import("./sections/settings/zh.json"), import("./sections/auth/zh.json"), import("./sections/ui/zh.json")]).then((ms) => ms.map((m) => m.default)),
  de: () => Promise.all([import("./sections/app/de.json"), import("./sections/spaces/de.json"), import("./sections/tools/de.json"), import("./sections/admin/de.json"), import("./sections/settings/de.json"), import("./sections/auth/de.json"), import("./sections/ui/de.json")]).then((ms) => ms.map((m) => m.default)),
  es: () => Promise.all([import("./sections/app/es.json"), import("./sections/spaces/es.json"), import("./sections/tools/es.json"), import("./sections/admin/es.json"), import("./sections/settings/es.json"), import("./sections/auth/es.json"), import("./sections/ui/es.json")]).then((ms) => ms.map((m) => m.default)),
  fr: () => Promise.all([import("./sections/app/fr.json"), import("./sections/spaces/fr.json"), import("./sections/tools/fr.json"), import("./sections/admin/fr.json"), import("./sections/settings/fr.json"), import("./sections/auth/fr.json"), import("./sections/ui/fr.json")]).then((ms) => ms.map((m) => m.default)),
  ur: () => Promise.all([import("./sections/app/ur.json"), import("./sections/spaces/ur.json"), import("./sections/tools/ur.json"), import("./sections/admin/ur.json"), import("./sections/settings/ur.json"), import("./sections/auth/ur.json"), import("./sections/ui/ur.json")]).then((ms) => ms.map((m) => m.default)),
};
