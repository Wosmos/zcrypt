"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "@/components/providers/theme-provider";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/store/preferences";
import { COLOR_THEMES } from "@/lib/themes";
import { ArrowRight, Settings, X } from "@/lib/icons";
import { ThemeModeControl } from "@/components/settings/theme-mode-control";
import { ThemePicker } from "@/components/settings/theme-picker";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

const ICON_BUTTON =
  "flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] data-[state=open]:bg-[var(--color-surface-1)] data-[state=open]:text-[var(--color-text)]";

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/60 p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function QuickSettings() {
  const t = useTranslations("ui.quickSettings");
  const ts = useTranslations("settings");
  const tp = useTranslations("settings.themePicker");
  const [open, setOpen] = useState(false);
  const { colorTheme } = useTheme();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const setAdvancedMode = usePreferencesStore((s) => s.setAdvancedMode);
  const current = COLOR_THEMES.find((c) => c.id === colorTheme);
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <SheetPrimitive.Root open={open} onOpenChange={setOpen}>
      <SheetPrimitive.Trigger aria-label={t("open")} title={t("open")} className={ICON_BUTTON}>
        <Settings className="h-5 w-5" />
      </SheetPrimitive.Trigger>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[380px] flex-col border-s border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300 sm:inset-y-3 sm:end-3 sm:rounded-3xl sm:border rtl:data-[state=closed]:slide-out-to-left rtl:data-[state=open]:slide-in-from-left"
        >
          <header className="flex items-center justify-between px-5 pb-3 pt-[calc(1.25rem+var(--safe-top,0px))] sm:pt-5">
            <SheetPrimitive.Title className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight text-[var(--color-text)]">
              {t("title")}
            </SheetPrimitive.Title>
            <SheetPrimitive.Description className="sr-only">
              {t("description")}
            </SheetPrimitive.Description>
            <SheetPrimitive.Close
              aria-label={t("close")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <X className="h-4 w-4" />
            </SheetPrimitive.Close>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="group flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-on-accent)] shadow-[0_8px_24px_-12px_var(--color-accent)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              {t("allSettings")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
            </Link>

            <Section>
              <p className="text-sm text-[var(--color-text)]">
                <span className="font-semibold">{ts("themeGroup")}:</span>{" "}
                <span className="text-[var(--color-text-secondary)]">
                  {current ? tp(`themes.${current.id}.label`) : tp("custom")}
                </span>
              </p>

              <ThemeModeControl className="mt-3" />
              <div className="mt-3">
                <ThemePicker compact />
              </div>
            </Section>

            <Section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)]">{ts("languageRow")}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{ts("languageDesc")}</p>
              </div>
              <LanguageSwitcher />
            </Section>

            <Section className="flex items-center justify-between gap-3">
              <label htmlFor="qs-advanced" className="min-w-0 cursor-pointer">
                <span className="block text-sm font-medium text-[var(--color-text)]">
                  {ts("advancedMode")}
                </span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {ts("advancedModeDesc")}
                </span>
              </label>
              <Switch
                id="qs-advanced"
                checked={advancedMode}
                onCheckedChange={(v) => setAdvancedMode(v)}
              />
            </Section>
          </div>

          <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3 pb-[calc(0.75rem+var(--safe-bottom,0px))] text-xs text-[var(--color-text-muted)]">
            <a
              href={`${SITE_URL}/changelog`}
              target="_blank"
              rel="noreferrer"
              className="font-medium transition-colors hover:text-[var(--color-text)]"
            >
              {t("whatsNew")}
            </a>
            {version ? <span className="font-mono tabular-nums">v{version}</span> : null}
          </footer>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
