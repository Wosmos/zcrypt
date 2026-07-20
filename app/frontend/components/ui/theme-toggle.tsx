"use client";

import { Sun, Moon } from "@/lib/icons";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. The button itself reads as the mode — sun and moon
 * crossfade with a rotate/scale swap — and the page reveal (a circle growing
 * from this button) is seeded by passing the click event straight through to
 * toggleTheme, so the origin is exactly the button's center.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)]",
        className
      )}
    >
      {/* Sun — shown in dark mode (the action: go light) */}
      <Sun
        className={cn(
          "absolute h-4 w-4 transition-all duration-300 ease-out motion-reduce:transition-none",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        )}
      />
      {/* Moon — shown in light mode (the action: go dark) */}
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300 ease-out motion-reduce:transition-none",
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        )}
      />
    </button>
  );
}
