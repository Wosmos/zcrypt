"use client";

import { useTranslations } from "next-intl";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { LOCALES, isLocale } from "@/lib/i18n";
import { ChevronDown, Globe } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  variant = "field",
  className,
}: {
  variant?: "field" | "footer";
  className?: string;
}) {
  const t = useTranslations("common");
  const { locale, setLocale } = useLocaleControl();
  const footer = variant === "footer";

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Globe
        aria-hidden="true"
        className="pointer-events-none absolute start-3 h-4 w-4 text-[var(--color-text-muted)]"
      />
      <select
        aria-label={t("language")}
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className={cn(
          "appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 ps-9 pe-8 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10",
          footer && "min-h-11 rounded-full bg-[var(--color-surface)]/40 text-[0.8rem] md:min-h-9",
        )}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-2.5 h-4 w-4 text-[var(--color-text-muted)]"
      />
    </div>
  );
}
