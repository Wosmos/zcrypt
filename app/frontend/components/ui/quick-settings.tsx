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
import { ArrowRight, Check, Monitor, Moon, Settings, Sun, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

const MODES = [
  { id: "light", icon: Sun, key: "themeLight" },
  { id: "dark", icon: Moon, key: "themeDark" },
  { id: "system", icon: Monitor, key: "themeSystem" },
] as const;

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
  const { theme, setTheme, resolvedTheme, colorTheme, setColorTheme } = useTheme();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const setAdvancedMode = usePreferencesStore((s) => s.setAdvancedMode);
  const isDark = resolvedTheme === "dark";
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
                  {current ? tp(`themes.${current.id}.label` as never) : tp("custom")}
                </span>
              </p>

              <div
                role="radiogroup"
                aria-label={ts("mode")}
                className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface)] p-1 ring-1 ring-[var(--color-border)]"
              >
                {MODES.map((m) => {
                  const active = theme === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(m.id)}
                      className={cn(
                        "flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        active
                          ? "bg-[var(--color-surface-2)] text-[var(--color-text)] shadow-sm"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                      )}
                    >
                      <m.icon className="h-3.5 w-3.5" />
                      {ts(m.key)}
                    </button>
                  );
                })}
              </div>

              <div
                role="radiogroup"
                aria-label={tp("colorTheme")}
                className="mt-3 grid grid-cols-3 gap-2"
              >
                {COLOR_THEMES.map((c) => {
                  const sw = isDark ? c.dark : c.light;
                  const active = colorTheme === c.id;
                  const label = tp(`themes.${c.id}.label` as never);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={label}
                      title={label}
                      onClick={() => setColorTheme(c.id)}
                      className={cn(
                        "group relative h-14 overflow-hidden rounded-xl ring-1 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        active
                          ? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface-1)]"
                          : "ring-[var(--color-border)] hover:ring-[var(--color-border-hover)]",
                      )}
                      style={{ background: sw.bg }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 start-0 flex w-[34%] flex-col gap-1 p-1.5"
                        style={{ background: sw.sidebar }}
                      >
                        <span className="h-1 w-3 rounded-full" style={{ background: sw.accent }} />
                        <span
                          className="h-0.5 w-full rounded-full opacity-30"
                          style={{ background: sw.accent }}
                        />
                        <span
                          className="h-0.5 w-3/4 rounded-full opacity-20"
                          style={{ background: sw.accent }}
                        />
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 end-1.5 start-[40%] rounded-md"
                        style={{ background: sw.surface }}
                      />
                      {active ? (
                        <span className="absolute bottom-1 end-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)]">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
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
