"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { COLOR_THEMES, CUSTOM_COLOR_THEME } from "@/lib/themes";
import { APP_BACKGROUNDS, getAppBackgroundByKey } from "@/lib/app-backgrounds";
import { SURFACE_STYLES } from "@/lib/surface-styles";
import { FOLDER_SHAPES, SHAPE_FOR_SURFACE } from "@/lib/folder-shapes";
import { CheckCircle2, Check } from "@/lib/icons";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Color-theme picker (internal app only). Renders a live mini-preview of each
 * palette in the *current* light/dark mode, so the swatch matches what will
 * actually apply. Selection is per device (localStorage via ThemeProvider).
 * A trailing "Custom" card lets the user pick their own accent + canvas color
 * (plus an optional decorative background design) instead of a curated preset.
 */
export function ThemePicker() {
  const {
    colorTheme,
    setColorTheme,
    resolvedTheme,
    customTheme,
    setCustomTheme,
    surfaceStyle,
    setSurfaceStyle,
    folderShape,
    setFolderShape,
  } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isCustomActive = colorTheme === CUSTOM_COLOR_THEME;
  const customBgImage = customTheme.background ? getAppBackgroundByKey(customTheme.background) : null;
  // The folder shape actually in effect (explicit pick, else the surface default).
  const effectiveShape = folderShape || SHAPE_FOR_SURFACE[surfaceStyle] || "mac";

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

        {/* Custom — same mockup shape as the presets, driven by the user's own
            picks instead of a fixed palette. */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustomActive}
          aria-label="Custom"
          title="Your own accent, canvas color, and background design"
          onClick={() => setColorTheme(CUSTOM_COLOR_THEME)}
          className={cn(
            "squircle group relative overflow-hidden rounded-xl border p-2 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
            isCustomActive
              ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
              : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
          )}
        >
          <div
            className="squircle relative h-20 w-full overflow-hidden rounded-lg ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.02] dark:ring-white/10"
            style={{ background: customBgImage ?? (isDark ? customTheme.bgDark : customTheme.bgLight) }}
          >
            <div className="absolute inset-y-0 left-0 flex w-[30%] flex-col gap-1.5 bg-black/15 p-2">
              <div className="h-2 w-2 rounded-full" style={{ background: customTheme.accent }} />
              <div className="h-1 w-full rounded-full opacity-25" style={{ background: customTheme.accent }} />
              <div className="h-1 w-4/5 rounded-full opacity-20" style={{ background: customTheme.accent }} />
            </div>
            <div className="absolute inset-y-0 left-[30%] right-0 flex flex-col gap-1.5 p-2">
              <div className="h-2.5 w-10 rounded-full" style={{ background: customTheme.accent }} />
              <div className="flex-1 rounded-md bg-white/90 p-1.5 shadow-sm">
                <div className="h-1 w-3/4 rounded-full opacity-30" style={{ background: customTheme.accent }} />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-[var(--color-text)]">Custom</span>
            {isCustomActive && (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
            )}
          </div>
        </button>
      </div>

      {isCustomActive && (
        <CustomThemeEditor values={customTheme} onChange={setCustomTheme} isDark={isDark} />
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        Applies to the app only, set per device. Light and dark follow the mode above.
        {isCustomActive && " Custom colors stay on this device only."}
      </p>

      {/* ── Surface style: a design language (radius/shadow/border + folder
          shape) that combines with ANY color above. ── */}
      <div className="space-y-2 pt-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Style
        </p>
        <div role="radiogroup" aria-label="Surface style" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACE_STYLES.map((s) => {
            const active = surfaceStyle === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={s.label}
                title={s.description}
                onClick={() => setSurfaceStyle(s.id)}
                data-surface-preview={s.id}
                className={cn(
                  "group relative overflow-hidden rounded-xl border p-2 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                  active
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
                )}
              >
                {/* Live mini-surface rendered in THIS style, so the shape/shadow
                    reads at a glance (see .style-swatch in globals.css). */}
                <div className="flex h-16 items-center justify-center rounded-lg bg-[var(--color-surface-1)]">
                  <span className="style-swatch" data-style={s.id} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--color-text)]">{s.label}</span>
                  {active && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Folder shape: 5 silhouettes. "Auto" follows the surface style. ── */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Folder shape
        </p>
        <div role="radiogroup" aria-label="Folder shape" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <button
            type="button"
            role="radio"
            aria-checked={!folderShape}
            aria-label="Auto"
            title="Follow the surface style"
            onClick={() => setFolderShape("")}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-medium text-[var(--color-text-muted)] transition-all duration-200",
              !folderShape
                ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
            )}
          >
            Auto
          </button>
          {FOLDER_SHAPES.map((shape) => {
            const active = folderShape === shape.key;
            const showRing = active || (!folderShape && effectiveShape === shape.key);
            return (
              <button
                key={shape.key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={shape.label}
                title={shape.label}
                onClick={() => setFolderShape(shape.key)}
                className={cn(
                  "flex h-14 items-center justify-center rounded-lg border transition-all duration-200",
                  showRing
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
                )}
              >
                <svg viewBox="0 0 120 100" className="h-8 w-10 text-[var(--color-accent)]" aria-hidden="true">
                  <path d={shape.backPanel} fill="currentColor" fillOpacity={0.45} />
                  <path d={shape.pocket} fill="currentColor" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CustomValues = { accent: string; bgLight: string; bgDark: string; background?: string };

function CustomThemeEditor({
  values,
  onChange,
  isDark,
}: {
  values: CustomValues;
  onChange: (next: CustomValues) => void;
  isDark: boolean;
}) {
  const [accentHex, setAccentHex] = useState(values.accent);
  const [bgLightHex, setBgLightHex] = useState(values.bgLight);
  const [bgDarkHex, setBgDarkHex] = useState(values.bgDark);

  const commitAccent = (value: string) => {
    setAccentHex(value);
    if (HEX_COLOR_RE.test(value)) onChange({ ...values, accent: value });
  };
  const commitBgLight = (value: string) => {
    setBgLightHex(value);
    if (HEX_COLOR_RE.test(value)) onChange({ ...values, bgLight: value });
  };
  const commitBgDark = (value: string) => {
    setBgDarkHex(value);
    if (HEX_COLOR_RE.test(value)) onChange({ ...values, bgDark: value });
  };
  const selectDesign = (key: string | undefined) => {
    onChange({ ...values, background: key });
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
      <div className="grid grid-cols-3 gap-3">
        <ColorField label="Accent" hex={accentHex} onChange={commitAccent} />
        {/* Separate light + dark canvases so the custom theme follows the mode
            toggle. The one matching the current mode is marked "live". */}
        <ColorField label={isDark ? "Light canvas" : "Light canvas · live"} hex={bgLightHex} onChange={commitBgLight} />
        <ColorField label={isDark ? "Dark canvas · live" : "Dark canvas"} hex={bgDarkHex} onChange={commitBgDark} />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Background design (optional)
        </p>
        <div role="radiogroup" aria-label="Background design" className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          <button
            type="button"
            role="radio"
            aria-checked={!values.background}
            aria-label="None"
            title="None — flat canvas color"
            onClick={() => selectDesign(undefined)}
            className={cn(
              "relative flex h-10 items-center justify-center rounded-lg border text-[10px] font-medium text-[var(--color-text-muted)] transition-all duration-200",
              !values.background
                ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
            )}
          >
            None
          </button>
          {APP_BACKGROUNDS.map((design) => {
            const active = values.background === design.key;
            return (
              <button
                key={design.key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={design.label}
                title={design.label}
                onClick={() => selectDesign(design.key)}
                style={{ background: design.css }}
                className={cn(
                  "relative flex h-10 items-center justify-center rounded-lg border transition-all duration-200",
                  active
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
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
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)]"
          style={{ background: HEX_COLOR_RE.test(hex) ? hex : "var(--color-surface-2)" }}
        >
          <input
            type="color"
            value={HEX_COLOR_RE.test(hex) ? hex : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} color`}
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
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}
