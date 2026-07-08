import { create } from "zustand";
import type { Severity } from "@/lib/utils";
import { genId } from "@/lib/id";

// The 4-member severity union is shared app-wide — aliased to Severity so toasts
// and notifications can't drift.
export type ToastType = Severity;

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  add: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

// Hard cap on concurrent toasts. Capping at the data level (rather than only in
// the renderer) means an over-cap toast is dropped outright — so it can never
// re-surface later and restart its countdown bar out of sync with its timer.
const MAX_TOASTS = 5;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (type, message) => {
    const id = genId("toast", { time: false });
    set((s) => {
      const next = [...s.toasts, { id, type, message }];
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
  success: (msg: string) => useToastStore.getState().add("success", msg),
  error: (msg: string) => useToastStore.getState().add("error", msg),
  info: (msg: string) => useToastStore.getState().add("info", msg),
  warning: (msg: string) => useToastStore.getState().add("warning", msg),
};
