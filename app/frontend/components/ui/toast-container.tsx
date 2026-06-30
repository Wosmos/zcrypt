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

const styles = {
  success: "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  error: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  warning: "border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
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
        const assertive = t.type === "error" || t.type === "warning";
        return (
          <div
            key={t.id}
            role={assertive ? "alert" : "status"}
            aria-live={assertive ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md animate-slide-up sm:rounded-xl",
              styles[t.type]
            )}
          >
            <Icon className="h-5 w-5 mt-px flex-shrink-0 sm:h-4 sm:w-4 sm:mt-0.5" />
            <p className="flex-1 text-sm leading-relaxed">{t.message}</p>
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
