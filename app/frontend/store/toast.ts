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
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  add: (type: ToastType, message: string, action?: ToastAction) => void;
  remove: (id: string) => void;
  pause: () => void;
  resume: () => void;
}

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

const timers = new Map<string, Timer>();
let paused = false;

// Hard cap on concurrent toasts. Capping at the data level (rather than only in
// the renderer) means an over-cap toast is dropped outright, so it can never
// re-surface later and restart its countdown bar out of sync with its timer.
const MAX_TOASTS = 5;

export const TOAST_DURATION = 4000;
// A toast carrying an action (Undo) needs enough time to read and reach for it.
export const TOAST_ACTION_DURATION = 7000;

function arm(id: string, timer: Timer, set: (fn: (s: ToastStore) => Partial<ToastStore>) => void) {
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => {
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, timer.remaining);
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (type, message, action) => {
    const id = genId("toast", { time: false });
    const duration = action ? TOAST_ACTION_DURATION : TOAST_DURATION;
    set((s) => {
      const next = [...s.toasts, { id, type, message, action, duration }];
      return { toasts: next.slice(-MAX_TOASTS) };
    });
    const timer: Timer = { handle: null, remaining: duration, startedAt: Date.now() };
    timers.set(id, timer);
    if (!paused) arm(id, timer, set);
  },

  pause: () => {
    paused = true;
    for (const timer of timers.values()) {
      if (timer.handle === null) continue;
      clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    }
  },

  resume: () => {
    paused = false;
    for (const [id, timer] of timers) {
      if (timer.handle === null) arm(id, timer, set);
    }
  },

  remove: (id) => {
    const timer = timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.delete(id);
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
