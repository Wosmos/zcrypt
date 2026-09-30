"use client";

import { useTranslations } from "next-intl";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { LOCALES, isLocale } from "@/lib/i18n";
import { ChevronDown, Languages } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  variant = "field",
  className,
}: {
  variant?: "field" | "nav";
  className?: string;
}) {
  const t = useTranslations("common");
  const { locale, setLocale } = useLocaleControl();
  const nav = variant === "nav";
  const current = LOCALES.find((l) => l.code === locale)?.name;

  const options = LOCALES.map((l) => (
    <option key={l.code} value={l.code} lang={l.code}>
      {l.name}
    </option>
  ));

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isLocale(e.target.value)) setLocale(e.target.value);
  };

  if (nav) {
    return (
      <div
        title={current}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-[var(--color-accent)] hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)]",
          className,
        )}
      >
        <Languages aria-hidden="true" className="pointer-events-none h-4 w-4" />
        <select
          aria-label={t("language")}
          value={locale}
          onChange={onChange}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {options}
        </select>
      </div>
    );
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Languages
        aria-hidden="true"
        className="pointer-events-none absolute start-3 h-4 w-4 text-[var(--color-text-muted)]"
      />
      <select
        aria-label={t("language")}
        value={locale}
        onChange={onChange}
        className="appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 ps-9 pe-8 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
      >
        {options}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-2.5 h-4 w-4 text-[var(--color-text-muted)]"
      />
    </div>
  );
}
