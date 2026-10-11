"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

export type Tr = ReturnType<typeof useTranslations>;

const TYPE_KEYS: Record<string, string> = {
  Document: "document",
  Spreadsheet: "spreadsheet",
  Image: "image",
  Video: "video",
  Audio: "audio",
  Archive: "archive",
  Code: "code",
  Data: "data",
  Executable: "executable",
  File: "file",
  Font: "font",
  Folder: "folder",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNITS: Record<string, string> = { d: "days", h: "hours", w: "weeks" };

export function typeLabel(t: Tr, label: string): string {
  const key = TYPE_KEYS[label];
  return key ? t(`drive.types.${key}`) : label;
}

export function modLabel(t: Tr, locale: string, mod: string): string {
  if (mod === "Just now") return t("drive.ago.justNow");
  const rel = /^(\d+)([dhw]) ago$/.exec(mod);
  if (rel) return t(`drive.ago.${UNITS[rel[2]]}`, { n: Number(rel[1]) });
  const date = /^([A-Z][a-z]{2}) (\d{2})$/.exec(mod);
  const month = date ? MONTHS.indexOf(date[1]) : -1;
  if (date && month >= 0) {
    return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
      month: "short",
      day: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, month, Number(date[2]))));
  }
  return mod;
}

/** Translated labels for the demo's data: folders, file types and modified times. */
export function useDriveText() {
  const t = useTranslations("site");
  const locale = useLocale();
  return useMemo(
    () => ({
      t,
      folder: (id: string) => t(`drive.folders.${id}`),
      type: (label: string) => typeLabel(t, label),
      mod: (mod: string) => modLabel(t, locale, mod),
    }),
    [t, locale],
  );
}
