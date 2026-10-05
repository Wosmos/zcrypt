"use client";

import { useTranslations } from "next-intl";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES } from "@/lib/i18n";
import { Check, ChevronDown, Languages } from "@/lib/icons";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language")}
        title={nav ? current : undefined}
        className={cn(
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
          nav
            ? "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)] data-[state=open]:bg-[var(--color-surface-1)]/60 data-[state=open]:text-[var(--color-text)]"
            : "inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 ps-3 pe-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/40 data-[state=open]:border-[var(--color-accent)]/40",
          className,
        )}
      >
        <Languages
          aria-hidden="true"
          className={cn("h-4 w-4", !nav && "text-[var(--color-text-muted)]")}
        />
        {nav ? null : (
          <>
            <span>{current}</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-[var(--color-text-muted)]" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {LOCALES.map((l) => {
          const active = l.code === locale;
          return (
            <DropdownMenuItem
              key={l.code}
              lang={l.code}
              dir={l.dir}
              onSelect={() => setLocale(l.code)}
              className={cn("justify-between", active && "font-semibold")}
            >
              {l.name}
              {active ? <Check aria-hidden="true" className="text-[var(--color-accent)]" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
