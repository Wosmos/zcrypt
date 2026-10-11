"use client";

import { NextIntlClientProvider, useMessages } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { DEFAULT_LOCALE, mergeMessages, type Locale } from "@/lib/i18n";
import { SITE_SECTIONS_EN, SITE_SECTIONS_LOADERS } from "@/messages/site-sections";

const siteEn = SITE_SECTIONS_EN.reduce<Record<string, unknown>>(
  (acc, section) => mergeMessages(acc, section),
  {},
);

/** Adds the marketing, docs and legal text on top of the app messages, only
 *  on the pages that need it, so the app bundle doesn't carry it. */
export function SiteI18nProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocaleControl();
  const appMessages = useMessages();
  const [loaded, setLoaded] = useState<{ locale: string; messages: Record<string, unknown> }>({
    locale: DEFAULT_LOCALE,
    messages: siteEn,
  });

  useEffect(() => {
    if (locale === DEFAULT_LOCALE) return;
    let cancelled = false;
    void SITE_SECTIONS_LOADERS[locale as Exclude<Locale, "en">]().then((sections) => {
      if (cancelled) return;
      const messages = sections.reduce<Record<string, unknown>>(
        (acc: Record<string, unknown>, section: Record<string, unknown>) =>
          mergeMessages(acc, section),
        siteEn,
      );
      setLoaded({ locale, messages });
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const site =
    loaded.locale === locale || locale === DEFAULT_LOCALE
      ? locale === DEFAULT_LOCALE
        ? siteEn
        : loaded.messages
      : siteEn;
  const messages = useMemo(
    () => mergeMessages(appMessages as Record<string, unknown>, site),
    [appMessages, site],
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
