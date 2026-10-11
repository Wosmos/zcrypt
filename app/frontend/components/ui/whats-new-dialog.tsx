"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NextIntlClientProvider, useMessages, useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ReleaseDate } from "@/components/changelog/release-date";
import { ReleaseGroups } from "@/components/changelog/release-groups";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { LATEST_RELEASED, findRelease } from "@/lib/changelog";
import { DEFAULT_LOCALE, mergeMessages, type Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import { isTauri } from "@/lib/tauri";

type Catalog = Record<string, unknown>;

const LOADERS: Record<Locale, () => Promise<{ default: Catalog }>> = {
  en: () => import("@/messages/site/changelog/en.json"),
  ar: () => import("@/messages/site/changelog/ar.json"),
  ru: () => import("@/messages/site/changelog/ru.json"),
  zh: () => import("@/messages/site/changelog/zh.json"),
  de: () => import("@/messages/site/changelog/de.json"),
  es: () => import("@/messages/site/changelog/es.json"),
  fr: () => import("@/messages/site/changelog/fr.json"),
  ur: () => import("@/messages/site/changelog/ur.json"),
};

function WhatsNewBody({ version, onClose }: { version: string; onClose: () => void }) {
  const t = useTranslations("ui.whatsNew");
  const tp = useTranslations("changelog.page");
  const release = findRelease(version) ?? LATEST_RELEASED;
  const tr = useTranslations(`changelog.${release.key}`);
  const desktop = isTauri;
  const linkClass = buttonClass("secondary");
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
        {t("title")}
      </p>
      <DialogTitle className="text-xl leading-tight">{tr("title")}</DialogTitle>
      <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="font-mono font-semibold text-[var(--color-text)]">
          {tp("versionLabel", { version: release.version })}
        </span>
        <span aria-hidden="true">·</span>
        <ReleaseDate date={release.date} />
      </p>
      <DialogDescription>{tr("summary")}</DialogDescription>
      <ReleaseGroups release={release} compact className="py-1" />
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {desktop ? (
          <a
            href={`${SITE_URL}/changelog`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {t("seeFull")}
          </a>
        ) : (
          <Link href="/changelog" onClick={onClose} className={linkClass}>
            {t("seeFull")}
          </Link>
        )}
        <button type="button" onClick={onClose} className={buttonClass("primary")}>
          {t("gotIt")}
        </button>
      </div>
    </>
  );
}

/** Loads the changelog text only when the dialog is opened: it lives in the
 *  site catalogs, which the app bundle does not carry. */
export function WhatsNewDialog({
  open,
  onOpenChange,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}) {
  const { locale } = useLocaleControl();
  const appMessages = useMessages();
  const [loaded, setLoaded] = useState<{ locale: string; messages: Catalog } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const en = (await LOADERS[DEFAULT_LOCALE]()).default;
      const own = locale === DEFAULT_LOCALE ? en : (await LOADERS[locale]()).default;
      if (!cancelled) setLoaded({ locale, messages: mergeMessages(en, own) });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  if (!loaded || loaded.locale !== locale) return null;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={mergeMessages(appMessages as Catalog, loaded.messages)}
      timeZone="UTC"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <WhatsNewBody version={version} onClose={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>
  );
}
