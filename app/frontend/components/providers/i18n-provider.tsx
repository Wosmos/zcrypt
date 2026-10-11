"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import baseEn from "@/messages/en.json";
import { APP_SECTIONS_EN, APP_SECTIONS_LOADERS } from "@/messages/app-sections";
import {
  DEFAULT_LOCALE,
  applyDocumentLocale,
  detectLocale,
  mergeMessages,
  persistLocale,
  type Locale,
} from "@/lib/i18n";

const en = APP_SECTIONS_EN.reduce<typeof baseEn>(
  (acc, section) => mergeMessages(acc, section),
  baseEn,
);

type Messages = typeof en;

const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => Promise.resolve({ default: en }),
  ar: () => import("@/messages/ar.json"),
  ru: () => import("@/messages/ru.json"),
  zh: () => import("@/messages/zh.json"),
  de: () => import("@/messages/de.json"),
  es: () => import("@/messages/es.json"),
  fr: () => import("@/messages/fr.json"),
  ur: () => import("@/messages/ur.json"),
};

async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return en;
  const [{ default: overlay }, sections] = await Promise.all([
    loaders[locale](),
    APP_SECTIONS_LOADERS[locale as Exclude<Locale, "en">](),
  ]);
  return sections.reduce<Messages>(
    (acc, section) => mergeMessages(acc, section),
    mergeMessages(en, overlay),
  );
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function useLocaleControl() {
  return useContext(LocaleContext);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ locale: Locale; messages: Messages }>({
    locale: DEFAULT_LOCALE,
    messages: en,
  });

  const activate = useCallback(async (locale: Locale) => {
    const messages = await loadMessages(locale);
    applyDocumentLocale(locale);
    setState({ locale, messages });
  }, []);

  useEffect(() => {
    const detected = detectLocale();
    if (detected === DEFAULT_LOCALE) return;
    let cancelled = false;
    void loadMessages(detected).then((messages) => {
      if (cancelled) return;
      applyDocumentLocale(detected);
      setState({ locale: detected, messages });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(
    (locale: Locale) => {
      persistLocale(locale);
      void activate(locale);
    },
    [activate],
  );

  const value = useMemo(() => ({ locale: state.locale, setLocale }), [state.locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={state.locale} messages={state.messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
