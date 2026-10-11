"use client";

import { useEffect, useState } from "react";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { LOCALES, isLocale, localeDir, readStoredLocale, type Locale } from "@/lib/i18n";
import { isTauri } from "@/lib/tauri";
import { Languages, X } from "@/lib/icons";

const DISMISSED_KEY = "zcrypt-locale-hint-dismissed";
const OVERRIDE_PARAM = "zc_country";

const COUNTRY_LOCALE: Record<string, Exclude<Locale, "en">> = {
  ...Object.fromEntries(
    "SA AE EG IQ JO KW QA BH OM YE SY LB PS LY TN DZ MA SD MR".split(" ").map((c) => [c, "ar"]),
  ),
  PK: "ur",
  ...Object.fromEntries("RU BY KZ KG".split(" ").map((c) => [c, "ru"])),
  ...Object.fromEntries("CN SG".split(" ").map((c) => [c, "zh"])),
  ...Object.fromEntries("DE AT CH LI".split(" ").map((c) => [c, "de"])),
  ...Object.fromEntries(
    "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR".split(" ").map((c) => [c, "es"]),
  ),
  ...Object.fromEntries(
    "FR BE LU MC SN CI CM ML BF NE TG BJ GA CG CD MG HT".split(" ").map((c) => [c, "fr"]),
  ),
};

// Written in the suggested language itself: the visitor may not read the
// language the page is currently in.
const COPY: Record<Exclude<Locale, "en">, { message: string; action: string; close: string }> = {
  ar: { message: "zcrypt متاح باللغة العربية.", action: "التبديل إلى العربية", close: "إغلاق" },
  ur: { message: "zcrypt اردو میں بھی دستیاب ہے۔", action: "اردو میں دیکھیں", close: "بند کریں" },
  ru: {
    message: "zcrypt доступен на русском языке.",
    action: "Перейти на русский",
    close: "Закрыть",
  },
  zh: { message: "zcrypt 提供简体中文版本。", action: "切换到简体中文", close: "关闭" },
  de: {
    message: "zcrypt gibt es auch auf Deutsch.",
    action: "Auf Deutsch wechseln",
    close: "Schließen",
  },
  es: {
    message: "zcrypt también está disponible en español.",
    action: "Cambiar a español",
    close: "Cerrar",
  },
  fr: {
    message: "zcrypt est aussi disponible en français.",
    action: "Passer en français",
    close: "Fermer",
  },
};

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // storage unavailable: the bar simply comes back next visit
  }
}

async function visitorCountry(): Promise<string> {
  const override = new URLSearchParams(window.location.search).get(OVERRIDE_PARAM);
  if (override) return override.toUpperCase();
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/geo/country`, { credentials: "omit" });
  if (!res.ok) return "";
  const body = (await res.json()) as { country?: string };
  return typeof body.country === "string" ? body.country.toUpperCase() : "";
}

/**
 * Suggests the visitor's likely language once, based on their country, when
 * they haven't chosen one and the page shows something else. It never switches
 * by itself, so VPN users and travellers aren't surprised. Testing: add
 * ?zc_country=AE (or any country code) to the URL.
 */
export function LocaleSuggestion() {
  const { locale, setLocale } = useLocaleControl();
  const [suggested, setSuggested] = useState<Exclude<Locale, "en"> | null>(null);

  useEffect(() => {
    if (isTauri || dismissed() || readStoredLocale()) return;
    let cancelled = false;
    visitorCountry()
      .then((country) => {
        const hint = COUNTRY_LOCALE[country];
        if (!cancelled && hint && isLocale(hint)) setSuggested(hint);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!suggested || suggested === locale) return null;
  const copy = COPY[suggested];
  const name = LOCALES.find((l) => l.code === suggested)?.name ?? suggested;

  const close = () => {
    markDismissed();
    setSuggested(null);
  };

  return (
    <div
      role="region"
      aria-label={name}
      lang={suggested}
      dir={localeDir(suggested)}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-[var(--color-accent)]/50 bg-[var(--color-surface)] py-2 ps-3 pe-2 text-sm font-medium text-[var(--color-text)] shadow-2xl shadow-[var(--color-accent)]/20 ring-4 ring-[var(--color-accent)]/10 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 motion-reduce:animate-none md:bottom-6"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
        <Languages className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate">{copy.message}</span>
      <button
        type="button"
        onClick={() => {
          markDismissed();
          setLocale(suggested);
          setSuggested(null);
        }}
        className="shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
      >
        {copy.action}
      </button>
      <button
        type="button"
        onClick={close}
        aria-label={copy.close}
        className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
