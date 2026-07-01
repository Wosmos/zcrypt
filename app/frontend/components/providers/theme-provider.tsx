"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DEFAULT_COLOR_THEME, isValidColorTheme } from "@/lib/themes";
import { getDeviceId } from "@/lib/device";
import { getDevicePreference, saveDevicePreference } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Light / dark / system mode. */
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Color-theme family (palette). "default" = original zcrypt palette. */
  colorTheme: string;
  setColorTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const COLOR_THEME_KEY = "zcrypt-color-theme";
const MODE_KEY = "zcrypt-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

/** Apply (or clear) the color-theme attribute on <html>. "default" clears it
 *  so the original palette — which is gated on the attribute's absence —
 *  applies. Themes only engage where <html data-app> is also set (the app
 *  shell), so this is inert on marketing/auth pages. */
function applyColorTheme(id: string) {
  if (typeof document === "undefined") return;
  if (id && id !== DEFAULT_COLOR_THEME) {
    document.documentElement.dataset.theme = id;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Fire-and-forget persist of the per-device preference to the server. No-op
 *  when unauthenticated (e.g. marketing visitors) — localStorage still holds
 *  the choice locally. */
function syncPreferenceToServer(colorTheme: string, mode: string) {
  if (typeof window === "undefined") return;
  if (!useAuthStore.getState().accessToken) return;
  saveDevicePreference({
    device_id: getDeviceId(),
    color_theme: colorTheme,
    mode,
  }).catch(() => {});
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [colorTheme, setColorThemeState] = useState<string>(DEFAULT_COLOR_THEME);
  const [mounted, setMounted] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const pulledRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(MODE_KEY) as Theme | null;
    const initial = stored || "system";
    setThemeState(initial);
    setResolvedTheme(resolveTheme(initial));

    const storedColor = localStorage.getItem(COLOR_THEME_KEY);
    const initialColor = isValidColorTheme(storedColor)
      ? (storedColor as string)
      : DEFAULT_COLOR_THEME;
    setColorThemeState(initialColor);
    // The inline no-flash script already applied this pre-paint; re-assert in
    // case storage was written by another tab since.
    applyColorTheme(initialColor);

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);

    // Apply theme class change instantly
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("light", resolved === "light");

    // Brief transition hint (removed quickly to avoid paint overhead)
    document.documentElement.classList.add("theme-transition");
    const timer = setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 150);
    return () => clearTimeout(timer);
  }, [theme, mounted]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Once authenticated, reconcile with the server's per-device preference.
  // If the server has a saved row, it wins (this device's durable choice);
  // if not, seed it from the current local choice. Runs at most once.
  useEffect(() => {
    if (!mounted || !accessToken || pulledRef.current) return;
    pulledRef.current = true;
    let cancelled = false;
    getDevicePreference(getDeviceId())
      .then((pref) => {
        if (cancelled) return;
        if (pref.saved) {
          if (isValidColorTheme(pref.color_theme)) {
            setColorThemeState(pref.color_theme);
            localStorage.setItem(COLOR_THEME_KEY, pref.color_theme);
            applyColorTheme(pref.color_theme);
          }
          if (
            pref.mode === "light" ||
            pref.mode === "dark" ||
            pref.mode === "system"
          ) {
            setThemeState(pref.mode);
            localStorage.setItem(MODE_KEY, pref.mode);
          }
        } else {
          syncPreferenceToServer(
            localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
            localStorage.getItem(MODE_KEY) || "system"
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mounted, accessToken]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(MODE_KEY, t);
    syncPreferenceToServer(
      localStorage.getItem(COLOR_THEME_KEY) || DEFAULT_COLOR_THEME,
      t
    );
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const setColorTheme = useCallback((id: string) => {
    const next = isValidColorTheme(id) ? id : DEFAULT_COLOR_THEME;
    setColorThemeState(next);
    localStorage.setItem(COLOR_THEME_KEY, next);
    applyColorTheme(next);
    syncPreferenceToServer(next, localStorage.getItem(MODE_KEY) || "system");
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, colorTheme, setColorTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
