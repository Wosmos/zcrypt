"use client";

import { useToastStore } from "@/store/toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

// Per-type accent: a colored left bar + matching icon + a faint tinted chip
// behind the icon. The CARD itself sits on the solid theme surface (readable on
// any background) — the colour conveys type without turning the whole toast into
// a see-through wash. `info` uses the app accent so it feels on-brand; the
// others use semantic colours (success = emerald, error = rose, warning = amber)
// that read the same in light and dark.
const accents: Record<string, { bar: string; icon: string; chip: string }> = {
  success: { bar: "bg-emerald-500", icon: "text-emerald-500", chip: "bg-emerald-500/10" },
  error: { bar: "bg-rose-500", icon: "text-rose-500", chip: "bg-rose-500/10" },
  info: { bar: "bg-[var(--color-accent)]", icon: "text-[var(--color-accent)]", chip: "bg-[var(--color-accent)]/10" },
  warning: { bar: "bg-amber-500", icon: "text-amber-500", chip: "bg-amber-500/10" },
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        // Mobile: full-width banner pinned near the top, clear of the notch.
        "fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[100] flex flex-col gap-2 pointer-events-none",
        // Desktop: compact stack in the top-right.
        "sm:inset-x-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-sm"
      )}
    >
      {toasts.map((t) => {
        const Icon = icons[t.type];
        const accent = accents[t.type];
        const assertive = t.type === "error" || t.type === "warning";
        return (
          <div
            key={t.id}
            role={assertive ? "alert" : "status"}
            aria-live={assertive ? "assertive" : "polite"}
            className={cn(
              // Solid theme surface (readable on any background), crisp border +
              // elevation, a light frost, and a colored accent bar down the left.
              "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-[var(--color-border)]",
              "bg-[var(--color-surface)]/95 py-3 pl-4 pr-3 text-[var(--color-text)] shadow-2xl backdrop-blur-md animate-slide-up sm:rounded-xl"
            )}
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", accent.bar)} aria-hidden="true" />
            <span className={cn("mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg", accent.chip)}>
              <Icon className={cn("h-4 w-4", accent.icon)} />
            </span>
            <p className="flex-1 pt-0.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="-m-1 flex-shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
