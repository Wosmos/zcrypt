"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { COLOR_THEMES, CUSTOM_COLOR_THEME } from "@/lib/themes";
import { APP_BACKGROUNDS, getAppBackgroundByKey } from "@/lib/app-backgrounds";
import { CheckCircle2, Check } from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import { designedMode, paletteFor, type CustomThemeValues } from "@/lib/custom-theme";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

interface CardPalette {
  accent: string;
  bg: string;
  surface: string;
  sidebar: string;
  /** Full CSS background for the canvas (a decorative design), else `bg`. */
  canvas?: string;
}

/** One theme card: a mini app mockup (sidebar with an accent dot, header pill,
 *  surface card) in the theme's real colors. Shared by presets and Custom. */
function ThemeCard({
  palette,
  label,
  description,
  active,
  compact,
  onSelect,
}: {
  palette: CardPalette;
  label: string;
  description: string;
  active: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={compact ? label : description}
      onClick={onSelect}
      className={cn(
        "squircle group relative overflow-hidden rounded-xl border text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
        compact ? "p-1" : "p-2",
        active
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
      )}
    >
      <div
        className={cn(
          "squircle relative w-full overflow-hidden rounded-lg ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.02] dark:ring-white/10",
          compact ? "h-12" : "h-20",
        )}
        style={{ background: palette.canvas ?? palette.bg }}
      >
        <div
          className={cn(
            "absolute inset-y-0 start-0 flex w-[30%] flex-col",
            compact ? "gap-1 p-1.5" : "gap-1.5 p-2",
          )}
          style={{ background: palette.sidebar }}
        >
          <div className="h-2 w-2 rounded-full" style={{ background: palette.accent }} />
          <div
            className="h-1 w-full rounded-full opacity-25"
            style={{ background: palette.accent }}
          />
          <div
            className="h-1 w-4/5 rounded-full opacity-20"
            style={{ background: palette.accent }}
          />
        </div>
        <div
          className={cn(
            "absolute inset-y-0 end-0 start-[30%] flex flex-col",
            compact ? "gap-1 p-1.5" : "gap-1.5 p-2",
          )}
        >
          <div
            className={cn("rounded-full", compact ? "h-1.5 w-6" : "h-2.5 w-10")}
            style={{ background: palette.accent }}
          />
          <div
            className={cn("flex-1 rounded-md shadow-sm", compact ? "p-1" : "p-1.5")}
            style={{ background: palette.surface }}
          >
            <div
              className="h-1 w-3/4 rounded-full opacity-30"
              style={{ background: palette.accent }}
            />
          </div>
        </div>
        {compact && active ? (
          <span className="absolute bottom-1 end-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)]">
            <Check className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </div>
      {compact ? null : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-[var(--color-text)]">{label}</span>
          {active && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />}
        </div>
      )}
    </button>
  );
}

/**
 * Color-theme picker (internal app only), used by Settings and, `compact`, by
 * Quick settings. Each card previews its palette in the *current* light/dark
 * mode, so the swatch matches what will actually apply. Selection is per
 * device (localStorage via ThemeProvider). The trailing "Custom" card takes the
 * user's own accent + canvas (plus an optional background design); its other
 * light/dark version is derived in lib/custom-theme.ts.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("settings.themePicker");
  const { colorTheme, setColorTheme, resolvedTheme, customTheme, setCustomTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isCustomActive = colorTheme === CUSTOM_COLOR_THEME;
  const custom = paletteFor(customTheme, resolvedTheme);
  const customPalette: CardPalette = {
    ...custom,
    surface: `color-mix(in oklab, ${custom.bg} 90%, white)`,
    sidebar: `color-mix(in oklab, ${custom.bg} 85%, black)`,
    canvas: customTheme.background
      ? (getAppBackgroundByKey(customTheme.background) ?? undefined)
      : undefined,
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-2"}>
      {compact ? null : (
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {t("colorTheme")}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t("colorTheme")}
        className={cn("grid", compact ? "grid-cols-3 gap-2" : "grid-cols-2 gap-3 sm:grid-cols-3")}
      >
        {COLOR_THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            palette={isDark ? theme.dark : theme.light}
            label={t(`themes.${theme.id}.label`)}
            description={t(`themes.${theme.id}.description`)}
            active={colorTheme === theme.id}
            compact={compact}
            onSelect={() => setColorTheme(theme.id)}
          />
        ))}
        <ThemeCard
          palette={customPalette}
          label={t("custom")}
          description={t("customDesc")}
          active={isCustomActive}
          compact={compact}
          onSelect={() => setColorTheme(CUSTOM_COLOR_THEME)}
        />
      </div>

      {isCustomActive && (
        <CustomThemeEditor values={customTheme} onChange={setCustomTheme} compact={compact} />
      )}

      {compact ? null : (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t("footnote")}
          {isCustomActive && ` ${t("footnoteCustom")}`}
        </p>
      )}
    </div>
  );
}

function CustomThemeEditor({
  values,
  onChange,
  compact,
}: {
  values: CustomThemeValues;
  onChange: (next: CustomThemeValues) => void;
  compact: boolean;
}) {
  const t = useTranslations("settings.themePicker");
  const [accentHex, setAccentHex] = useState(values.accent);
  const [bgHex, setBgHex] = useState(values.bg);

  const commitAccent = (value: string) => {
    setAccentHex(value);
    if (HEX_COLOR_RE.test(value)) onChange({ ...values, accent: value });
  };
  const commitBg = (value: string) => {
    setBgHex(value);
    if (HEX_COLOR_RE.test(value)) onChange({ ...values, bg: value, background: undefined });
  };
  const selectDesign = (key: string | undefined) => {
    onChange({ ...values, background: key });
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
      <div className="grid grid-cols-2 gap-3">
        <ColorField label={t("accent")} hex={accentHex} onChange={commitAccent} />
        <ColorField label={t("canvas")} hex={bgHex} onChange={commitBg} />
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-[var(--color-text)]">{t("adapt")}</span>
          <span className="block text-[11px] leading-snug text-[var(--color-text-muted)]">
            {t("adaptDesc", {
              mode: designedMode(values) === "dark" ? t("adaptLight") : t("adaptDark"),
            })}
          </span>
        </span>
        <Switch
          checked={values.adapt !== false}
          onCheckedChange={(on) => onChange({ ...values, adapt: on })}
        />
      </label>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {t("backgroundDesign")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("backgroundDesignLabel")}
          className={cn("grid gap-2", compact ? "grid-cols-5" : "grid-cols-5 sm:grid-cols-6")}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!values.background}
            aria-label={t("none")}
            title={t("noneDesc")}
            onClick={() => selectDesign(undefined)}
            className={cn(
              "relative flex h-10 items-center justify-center rounded-lg border text-[10px] font-medium text-[var(--color-text-muted)] transition-all duration-200",
              !values.background
                ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
            )}
          >
            {t("none")}
          </button>
          {APP_BACKGROUNDS.map((design) => {
            const active = values.background === design.key;
            return (
              <button
                key={design.key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(`backgrounds.${design.key}`)}
                title={t(`backgrounds.${design.key}`)}
                onClick={() => selectDesign(design.key)}
                style={{ background: design.css }}
                className={cn(
                  "relative flex h-10 items-center justify-center rounded-lg border transition-all duration-200",
                  active
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
                )}
              >
                {active && (
                  <Check className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-[var(--color-accent)] p-0.5 text-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  hex,
  onChange,
}: {
  label: string;
  hex: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("settings.themePicker");
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)]"
          style={{ background: HEX_COLOR_RE.test(hex) ? hex : "var(--color-surface-2)" }}
        >
          <input
            type="color"
            value={HEX_COLOR_RE.test(hex) ? hex : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t("colorOf", { label })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <input
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v && !v.startsWith("#") ? `#${v}` : v);
          }}
          placeholder="#3B82F6"
          maxLength={7}
          className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-xs uppercase text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          aria-label={t("hexOf", { label })}
        />
      </div>
    </div>
  );
}
