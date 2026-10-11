"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme-provider";
import { Monitor, Moon, Sun } from "@/lib/icons";
import { cn } from "@/lib/utils";

const MODES = [
  { id: "light", icon: Sun, key: "themeLight" },
  { id: "dark", icon: Moon, key: "themeDark" },
  { id: "system", icon: Monitor, key: "themeSystem" },
] as const;

/** Light / Dark / System segmented control, shared by Settings and Quick settings. */
export function ThemeModeControl({ className }: { className?: string }) {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={t("mode")}
      className={cn(
        "grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface)] p-1 ring-1 ring-[var(--color-border)]",
        className,
      )}
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
              "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
              active
                ? "bg-[var(--color-surface-2)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
          >
            <m.icon className="h-3.5 w-3.5" />
            {t(m.key)}
          </button>
        );
      })}
    </div>
  );
}
