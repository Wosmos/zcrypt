import type { ComponentType } from "react";
import { create } from "zustand";
import type { Severity } from "@/lib/utils";
import { genId } from "@/lib/id";
import { playSound, type SoundEvent } from "@/lib/sounds";
import type { SoundArea } from "@/store/preferences";

export type ToastType = Severity;
export type ToastIcon = ComponentType<{ className?: string }>;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Optional extras for any toast. */
export interface ToastOptions {
  /** A second, quieter line under the message. */
  detail?: string;
  /** Replaces the kind's default icon. */
  icon?: ToastIcon;
  /** An image URL shown instead of the icon (warning and error rows). */
  thumbnail?: string;
  /** Turns the toast into an undo bar that calls this when Undo is pressed. */
  undo?: () => void;
  /** How long the toast stays, in milliseconds. */
  durationMs?: number;
  /** Merge toasts that share this key instead of comparing messages. */
  key?: string;
  /** The sound cue to play, or false for silence. Errors default to a problem cue. */
  sound?: { event: SoundEvent; area: SoundArea } | false;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
  icon?: ToastIcon;
  thumbnail?: string;
  action?: ToastAction;
  undo?: () => void;
  duration: number;
  count: number;
  key: string;
  lastAt: number;
}

interface ToastStore {
  toasts: Toast[];
  add: (
    type: ToastType,
    message: string,
    actionOrOptions?: ToastAction | ToastOptions,
    options?: ToastOptions,
  ) => void;
  remove: (id: string) => void;
  removeNewest: () => void;
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

const MAX_TOASTS = 6;
const MERGE_WINDOW_MS = 2000;

export const TOAST_DURATION = 4000;
export const TOAST_ACTION_DURATION = 7000;
export const TOAST_WARNING_DURATION = 6000;
export const TOAST_ERROR_DURATION = 8000;
export const TOAST_UNDO_DURATION = 8000;
/** Duration 0 means the toast stays until it is acted on or dismissed. */
export const TOAST_STICKY = 0;

function defaultDuration(type: ToastType, hasAction: boolean, isUndo: boolean): number {
  if (isUndo) return TOAST_UNDO_DURATION;
  if (type === "error") return hasAction ? TOAST_STICKY : TOAST_ERROR_DURATION;
  if (type === "warning") return TOAST_WARNING_DURATION;
  return hasAction ? TOAST_ACTION_DURATION : TOAST_DURATION;
}

const DROP_ORDER: ToastType[] = ["success", "info", "warning", "error"];

/** Drop the least important, oldest toasts first so an error is never pushed out by successes. */
function capToasts(list: Toast[]): Toast[] {
  const out = [...list];
  while (out.length > MAX_TOASTS) {
    const victim = DROP_ORDER.map((type) => out.findIndex((t) => t.type === type && !t.undo)).find(
      (i) => i >= 0,
    );
    const index = victim ?? 0;
    const [gone] = out.splice(index, 1);
    clearTimer(gone.id);
  }
  return out;
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
}

function arm(id: string, timer: Timer, set: (fn: (s: ToastStore) => Partial<ToastStore>) => void) {
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => {
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, timer.remaining);
}

/** Milliseconds left before a toast dismisses itself, or null when it is gone. */
export function toastRemainingMs(id: string): number | null {
  const timer = timers.get(id);
  if (!timer) return null;
  if (timer.handle === null) return timer.remaining;
  return Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
}

function isAction(value: ToastAction | ToastOptions | undefined): value is ToastAction {
  return Boolean(value && "label" in value && "onClick" in value);
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  add: (type, message, actionOrOptions, extra) => {
    const action = isAction(actionOrOptions) ? actionOrOptions : undefined;
    const options: ToastOptions = (isAction(actionOrOptions) ? extra : actionOrOptions) ?? {};
    const cue = options.sound ?? (type === "error" ? { event: "problem", area: "problems" } : null);
    if (cue) playSound(cue.event, cue.area);

    const key = options.key ?? `${type}:${message}`;
    const now = Date.now();
    const twin = get().toasts.find((t) => t.key === key && now - t.lastAt <= MERGE_WINDOW_MS);
    if (twin) {
      const timer = timers.get(twin.id);
      if (timer) {
        if (timer.handle) clearTimeout(timer.handle);
        timer.remaining = twin.duration;
        if (!paused) arm(twin.id, timer, set);
      }
      set((s) => ({
        toasts: s.toasts.map((t) =>
          t.id === twin.id
            ? { ...t, count: t.count + 1, lastAt: now, message, detail: options.detail ?? t.detail }
            : t,
        ),
      }));
      return;
    }

    const id = genId("toast", { time: false });
    const duration =
      options.durationMs ?? defaultDuration(type, Boolean(action), Boolean(options.undo));
    const toast: Toast = {
      id,
      type,
      message,
      detail: options.detail,
      icon: options.icon,
      thumbnail: options.thumbnail,
      action,
      undo: options.undo,
      duration,
      count: 1,
      key,
      lastAt: now,
    };
    set((s) => ({ toasts: capToasts([...s.toasts, toast]) }));
    if (duration > TOAST_STICKY && get().toasts.some((t) => t.id === id)) {
      const timer: Timer = { handle: null, remaining: duration, startedAt: now };
      timers.set(id, timer);
      if (!paused) arm(id, timer, set);
    }
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
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  removeNewest: () => {
    const newest = get().toasts.at(-1);
    if (newest) get().remove(newest.id);
  },
}));

export const toast = {
  success: (msg: string, action?: ToastAction | ToastOptions, options?: ToastOptions) =>
    useToastStore.getState().add("success", msg, action, options),
  error: (msg: string, action?: ToastAction | ToastOptions, options?: ToastOptions) =>
    useToastStore.getState().add("error", msg, action, options),
  info: (msg: string, action?: ToastAction | ToastOptions, options?: ToastOptions) =>
    useToastStore.getState().add("info", msg, action, options),
  warning: (msg: string, action?: ToastAction | ToastOptions, options?: ToastOptions) =>
    useToastStore.getState().add("warning", msg, action, options),
  /** A reversible action: shows the undo bar with an 8 second countdown. */
  undo: (message: string, onUndo: () => void, options?: Pick<ToastOptions, "detail" | "key">) =>
    useToastStore.getState().add("success", message, { ...options, undo: onUndo }),
};
