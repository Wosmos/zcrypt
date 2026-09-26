import { create } from "zustand";
import type { Severity } from "@/lib/utils";
import { genId } from "@/lib/id";

// The 4-member severity union is shared app-wide: aliased to Severity so toasts
// and notifications can't drift.
export type ToastType = Severity;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  add: (type: ToastType, message: string, action?: ToastAction) => void;
  remove: (id: string) => void;
}

// Hard cap on concurrent toasts. Capping at the data level (rather than only in
// the renderer) means an over-cap toast is dropped outright, so it can never
// re-surface later and restart its countdown bar out of sync with its timer.
const MAX_TOASTS = 5;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (type, message, action) => {
    const id = genId("toast", { time: false });
    set((s) => {
      const next = [...s.toasts, { id, type, message, action }];
      return { toasts: next.slice(-MAX_TOASTS) };
    });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  remove: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (msg: string, action?: ToastAction) =>
    useToastStore.getState().add("success", msg, action),
  error: (msg: string, action?: ToastAction) => useToastStore.getState().add("error", msg, action),
  info: (msg: string, action?: ToastAction) => useToastStore.getState().add("info", msg, action),
  warning: (msg: string, action?: ToastAction) =>
    useToastStore.getState().add("warning", msg, action),
};
