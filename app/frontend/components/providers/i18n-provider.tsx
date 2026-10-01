"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "@/messages/en.json";
import {
  DEFAULT_LOCALE,
  applyDocumentLocale,
  detectLocale,
  mergeMessages,
  persistLocale,
  type Locale,
} from "@/lib/i18n";

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
  const { default: overlay } = await loaders[locale]();
  return mergeMessages(en, overlay);
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
    if (detected !== DEFAULT_LOCALE) void activate(detected);
  }, [activate]);

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
