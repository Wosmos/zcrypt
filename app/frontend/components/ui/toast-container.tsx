"use client";

import { useToastStore } from "@/store/toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: "border-emerald-800/30 bg-emerald-500/10 text-emerald-300",
  error: "border-red-800/30 bg-red-500/10 text-red-300",
  info: "border-indigo-800/30 bg-indigo-500/10 text-indigo-300",
  warning: "border-yellow-800/30 bg-yellow-500/10 text-yellow-300",
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md animate-slide-up",
              styles[t.type]
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm flex-1 leading-relaxed">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="text-zinc-500 hover:text-zinc-300 flex-shrink-0 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
