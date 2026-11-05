"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CUSTOM_COLOR_THEME, DEFAULT_COLOR_THEME, isValidColorTheme } from "@/lib/themes";
import {
  applyCustomThemeVars,
  clearCustomThemeVars,
  clearCustomTheme,
  DEFAULT_CUSTOM_THEME,
  loadCustomTheme,
  parseCustomTheme,
  saveCustomTheme,
  type CustomThemeValues,
} from "@/lib/custom-theme";
import { getDeviceId } from "@/lib/device";
import { getDevicePreference, saveDevicePreference, type DevicePreference } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Light / dark / system mode. */
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Flip light <-> dark instantly, deliberately no whole-page animation;
   *  reveal/crossfade variants were tried and dropped (see git history):
   *  the double page snapshot made every toggle hitch. */
  toggleTheme: () => void;
  /** Color-theme family (palette). "default" = original zcrypt palette. */
  colorTheme: string;
  setColorTheme: (id: string) => void;
  /** The user's own accent/canvas/background-design pick, live regardless of
   *  whether "custom" is the active `colorTheme`, so the picker's editor can
   *  stay open and preview without losing the draft. */
  customTheme: CustomThemeValues;
  setCustomTheme: (values: CustomThemeValues) => void;
  /** This device follows the account's theme, so a change here or on any
   *  other following device shows everywhere. Off: this device keeps its own. */
  syncTheme: boolean;
  setSyncTheme: (on: boolean) => void;
  /** Re-read this device's theme from the server, e.g. after the event stream reconnects. */
  reloadPreference: () => void;
  /** Apply an account theme change pushed from another device, if this one follows it. */
  applyRemotePreference: (pref: RemotePreference) => void;
}

/** The account theme as the event stream pushes it. */
export interface RemotePreference {
  device_id?: string;
  color_theme?: string;
  mode?: string;
  custom_theme?: string;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
  customTheme: DEFAULT_CUSTOM_THEME,
  setCustomTheme: () => {},
  syncTheme: true,
  setSyncTheme: () => {},
  reloadPreference: () => {},
  applyRemotePreference: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const COLOR_THEME_KEY = "zcrypt-color-theme";
const MODE_KEY = "zcrypt-theme";
/** The account the theme in local storage belongs to, so it is never handed to another account. */
const OWNER_KEY = "zcrypt-theme-owner";
/** "0" when this device keeps its own theme instead of following the account's. */
const SYNC_KEY = "zcrypt-theme-sync";
const CUSTOM_SYNC_DELAY_MS = 800;

function isMode(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

/** Apply (or clear) the color-theme attribute on <html>. "default" clears it
 *  so the original palette: which is gated on the attribute's absence,
 *  applies. Themes only engage where <html data-app> is also set (the app
 *  shell), so this is inert on marketing/auth pages. */
function applyColorTheme(id: string) {
  if (typeof document === "undefined") return;
  if (id === CUSTOM_COLOR_THEME) {
    document.documentElement.dataset.theme = id;
    applyCustomThemeVars(loadCustomTheme());
    return;
  }
  // Inline custom vars outrank any CSS-block value, so they must be cleared
  // before a preset/default theme's own block can take effect.
  clearCustomThemeVars();
  if (id && id !== DEFAULT_COLOR_THEME) {
    document.documentElement.dataset.theme = id;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Put a resolved light/dark mode on <html>. A custom palette has a light and
 *  a dark version, so it is repainted for the new mode too. */
function paintMode(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  if (root.dataset.theme === CUSTOM_COLOR_THEME) applyCustomThemeVars(loadCustomTheme(), resolved);
}

/** Save this device's look to the server; null when signed out or the save failed.
 *  localStorage keeps the choice either way. */
function syncPreferenceToServer(
  colorTheme: string,
  mode: string,
  sync: boolean,
  join = false,
): Promise<DevicePreference | null> {
  const userId = currentUserId();
  if (!userId) return Promise.resolve(null);
  localStorage.setItem(OWNER_KEY, userId);
  return saveDevicePreference({
    device_id: getDeviceId(),
    color_theme: colorTheme,
    mode,
    custom_theme: JSON.stringify(loadCustomTheme()),
    sync,
    join,
  }).catch(() => null);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [colorTheme, setColorThemeState] = useState<string>(DEFAULT_COLOR_THEME);
  const [customTheme, setCustomThemeState] = useState<CustomThemeValues>(DEFAULT_CUSTOM_THEME);
  const [mounted, setMounted] = useState(false);
  const [syncTheme, setSyncThemeState] = useState(true);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const pulledFor = useRef<string | null>(null);
  const syncRef = useRef(true);
  const customTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(MODE_KEY) as Theme | null;
    const initial = stored || "system";
    // localStorage is only readable after hydration, so this sync belongs here.
    // oxlint-disable-next-line react/set-state-in-effect
    setThemeState(initial);
    setResolvedTheme(resolveTheme(initial));

    const storedColor = localStorage.getItem(COLOR_THEME_KEY);
    const initialColor = isValidColorTheme(storedColor)
      ? (storedColor as string)
      : DEFAULT_COLOR_THEME;
    setColorThemeState(initialColor);
    setCustomThemeState(loadCustomTheme());
    syncRef.current = localStorage.getItem(SYNC_KEY) !== "0";
    setSyncThemeState(syncRef.current);
    // The inline no-flash script already applied this pre-paint; re-assert in
    // case storage was written by another tab since.
    applyColorTheme(initialColor);

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const resolved = resolveTheme(theme);

    // Apply the mode instantly. There is deliberately no whole-page
    // animation: a color crossfade looked broken (only color/bg faded while
    // borders, shadows and icons snapped), and a View Transition reveal made
    // every toggle hitch on the double page snapshot.
    paintMode(resolved);
  }, [theme, mounted]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      paintMode(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  /** Show a theme that came from the server. The custom palette goes first,
   *  since applying a "custom" color theme reads it back from storage. */
  const applyPref = useCallback(
    (pref: { color_theme?: string; mode?: string; custom_theme?: string }) => {
      const custom = parseCustomTheme(pref.custom_theme);
      if (custom) {
        saveCustomTheme(custom);
        setCustomThemeState(custom);
      }
      const color = pref.color_theme;
      if (color && isValidColorTheme(color)) {
        setColorThemeState(color);
        localStorage.setItem(COLOR_THEME_KEY, color);
        applyColorTheme(color);
      }
      if (isMode(pref.mode)) {
        const resolved = resolveTheme(pref.mode);
        setThemeState(pref.mode);
        setResolvedTheme(resolved);
        localStorage.setItem(MODE_KEY, pref.mode);
        paintMode(resolved);
      }
    },
    [],
  );

  const setSyncFlag = useCallback((on: boolean) => {
    syncRef.current = on;
    setSyncThemeState(on);
    localStorage.setItem(SYNC_KEY, on ? "1" : "0");
  }, []);

  /** Load the signed-in account's theme for this device. An account with
   *  nothing saved keeps what is on screen only when that look is already its
   *  own, or nobody's yet; a theme left by another account is never handed
   *  over, the account starts from the defaults instead. */
  const pull = useCallback(
    (uid: string, isCurrent: () => boolean) => {
      getDevicePreference(getDeviceId())
        .then((pref) => {
          if (!isCurrent()) return;
          setSyncFlag(pref.sync !== false);
          const owner = localStorage.getItem(OWNER_KEY);
          if (pref.saved) {
            localStorage.setItem(OWNER_KEY, uid);
            applyPref(pref);
            return;
          }
          if (!owner || owner === uid) {
            void syncPreferenceToServer(
              localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
              localStorage.getItem(MODE_KEY) || "system",
              syncRef.current,
              true,
            ).then((saved) => {
              if (saved && isCurrent()) applyPref(saved);
            });
            return;
          }
          localStorage.setItem(OWNER_KEY, uid);
          clearCustomTheme();
          setCustomThemeState(DEFAULT_CUSTOM_THEME);
          applyPref({ color_theme: DEFAULT_COLOR_THEME, mode: "system" });
        })
        .catch(() => {});
    },
    [applyPref, setSyncFlag],
  );

  // Every time a different account signs in, even without a reload (switching
  // accounts in the desktop app), load that account's own theme.
  useEffect(() => {
    if (!mounted) return;
    if (!userId) {
      pulledFor.current = null;
      return;
    }
    if (pulledFor.current === userId) return;
    pulledFor.current = userId;
    pull(userId, () => pulledFor.current === userId);
  }, [mounted, userId, pull]);

  const reloadPreference = useCallback(() => {
    const uid = pulledFor.current;
    if (uid) pull(uid, () => pulledFor.current === uid);
  }, [pull]);

  const applyRemotePreference = useCallback(
    (pref: RemotePreference) => {
      if (!syncRef.current || pref.device_id === getDeviceId()) return;
      applyPref(pref);
    },
    [applyPref],
  );

  const setSyncTheme = useCallback(
    (on: boolean) => {
      setSyncFlag(on);
      void syncPreferenceToServer(
        localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
        localStorage.getItem(MODE_KEY) || "system",
        on,
        on,
      ).then((saved) => {
        if (saved && on && syncRef.current) applyPref(saved);
      });
    },
    [applyPref, setSyncFlag],
  );

  /** Apply the mode to React state and <html> in one pass. resolvedTheme is
   *  set in the same update as theme so consumers render once per change; the
   *  class-applying effect above then re-runs as a no-op. */
  const applyMode = useCallback((t: Theme) => {
    const resolved = resolveTheme(t);
    setThemeState(t);
    setResolvedTheme(resolved);
    paintMode(resolved);
  }, []);

  /** localStorage + server PUT: kept off the click frame so the flip paints
   *  before any I/O runs. */
  const persistMode = useCallback((t: Theme) => {
    localStorage.setItem(MODE_KEY, t);
    void syncPreferenceToServer(
      localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
      t,
      syncRef.current,
    );
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      applyMode(t);
      setTimeout(() => persistMode(t), 0);
    },
    [applyMode, persistMode],
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const setColorTheme = useCallback((id: string) => {
    const next = isValidColorTheme(id) ? id : DEFAULT_COLOR_THEME;
    setColorThemeState(next);
    localStorage.setItem(COLOR_THEME_KEY, next);
    applyColorTheme(next);
    void syncPreferenceToServer(next, localStorage.getItem(MODE_KEY) || "system", syncRef.current);
  }, []);

  // Custom colors are re-applied live only when "custom" is the active
  // colorTheme, so editing the draft never leaks into a selected preset. The
  // server save waits for the picker to settle instead of firing on every drag.
  const setCustomTheme = useCallback(
    (values: CustomThemeValues) => {
      setCustomThemeState(values);
      saveCustomTheme(values);
      if (colorTheme === CUSTOM_COLOR_THEME) applyCustomThemeVars(values, resolvedTheme);
      if (customTimer.current) clearTimeout(customTimer.current);
      customTimer.current = setTimeout(() => {
        customTimer.current = null;
        void syncPreferenceToServer(
          localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
          localStorage.getItem(MODE_KEY) || "system",
          syncRef.current,
        );
      }, CUSTOM_SYNC_DELAY_MS);
    },
    [colorTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        colorTheme,
        setColorTheme,
        customTheme,
        setCustomTheme,
        syncTheme,
        setSyncTheme,
        reloadPreference,
        applyRemotePreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
