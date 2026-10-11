"use client";

import { useLocale } from "next-intl";

export function formatReleaseDate(date: string, locale: string): string {
  const tag = locale === "en" ? "en-US" : locale;
  try {
    return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  } catch {
    return date;
  }
}

export function ReleaseDate({ date, className }: { date: string | null; className?: string }) {
  const locale = useLocale();
  if (!date) return null;
  return (
    <time dateTime={date} className={className}>
      {formatReleaseDate(date, locale)}
    </time>
  );
}
