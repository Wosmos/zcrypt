"use client";

import { useSyncExternalStore } from "react";
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

export function formatRelativeAge(date: string, locale: string, now: number = Date.now()): string {
  const tag = locale === "en" ? "en-US" : locale;
  const days = Math.round((now - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);
  try {
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    if (days < 14) return rtf.format(-Math.max(days, 0), "day");
    if (days < 60) return rtf.format(-Math.round(days / 7), "week");
    if (days < 540) return rtf.format(-Math.round(days / 30), "month");
    return rtf.format(-Math.round(days / 365), "year");
  } catch {
    return "";
  }
}

const subscribeNever = () => () => {};

export function ReleaseDate({
  date,
  className,
  relative = false,
}: {
  date: string | null;
  className?: string;
  relative?: boolean;
}) {
  const locale = useLocale();
  const age = useSyncExternalStore(
    subscribeNever,
    () => (relative && date ? formatRelativeAge(date, locale) : ""),
    () => "",
  );
  if (!date) return null;
  return (
    <>
      <time dateTime={date} className={className}>
        {formatReleaseDate(date, locale)}
      </time>
      {age ? (
        <span className="block text-[12px] text-[var(--color-text-muted)] opacity-80">{age}</span>
      ) : null}
    </>
  );
}
