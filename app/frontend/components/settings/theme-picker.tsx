"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { COLOR_THEMES } from "@/lib/themes";
import { CheckCircle2 } from "@/lib/icons";

/**
 * Color-theme picker (internal app only). Renders a live mini-preview of each
 * palette in the *current* light/dark mode, so the swatch matches what will
 * actually apply. Selection is per device (localStorage via ThemeProvider).
 */
export function ThemePicker() {
  const { colorTheme, setColorTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Color theme
      </p>
      <div
        role="radiogroup"
        aria-label="Color theme"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {COLOR_THEMES.map((t) => {
          const sw = isDark ? t.dark : t.light;
          const active = colorTheme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t.label}
              title={t.description}
              onClick={() => setColorTheme(t.id)}
              className={cn(
                "squircle group relative overflow-hidden rounded-xl border p-2 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                active
                  ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
              )}
            >
              {/* Mini app mockup: canvas + sidebar (with an accent logo dot) +
                  an accent header pill + a surface card — so each theme's
                  personality (accent, sidebar, surface) reads at a glance. */}
              <div
                className="squircle relative h-20 w-full overflow-hidden rounded-lg ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.02] dark:ring-white/10"
                style={{ background: sw.bg }}
              >
                <div
                  className="absolute inset-y-0 left-0 flex w-[30%] flex-col gap-1.5 p-2"
                  style={{ background: sw.sidebar }}
                >
                  <div className="h-2 w-2 rounded-full" style={{ background: sw.accent }} />
                  <div className="h-1 w-full rounded-full opacity-25" style={{ background: sw.accent }} />
                  <div className="h-1 w-4/5 rounded-full opacity-20" style={{ background: sw.accent }} />
                </div>
                <div className="absolute inset-y-0 left-[30%] right-0 flex flex-col gap-1.5 p-2">
                  <div className="h-2.5 w-10 rounded-full" style={{ background: sw.accent }} />
                  <div
                    className="flex-1 rounded-md p-1.5 shadow-sm"
                    style={{ background: sw.surface }}
                  >
                    <div className="h-1 w-3/4 rounded-full opacity-30" style={{ background: sw.accent }} />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-[var(--color-text)]">
                  {t.label}
                </span>
                {active && (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Applies to the app only, set per device. Light and dark follow the mode above.
      </p>
    </div>
  );
}
