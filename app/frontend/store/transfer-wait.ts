import { create } from "zustand";

/** Why a transfer is holding still instead of failing. */
export const WaitReason = {
  /** The user's own Telegram cannot be reached from this network. */
  TelegramBlocked: "telegram_blocked",
  /** The server turned the transfer away: the transfer allowance is used up. */
  AllowanceUsedUp: "allowance_used_up",
} as const;

export type WaitReason = (typeof WaitReason)[keyof typeof WaitReason];

export function isWaitReason(value: unknown): value is WaitReason {
  return value === WaitReason.TelegramBlocked || value === WaitReason.AllowanceUsedUp;
}

interface TransferWaitState {
  /** Waiting transfers by row key (`up:<id>` or `dl:<id>`). */
  waits: Record<string, WaitReason>;
  set: (key: string, reason: WaitReason) => void;
  clear: (key: string) => void;
  clearAll: () => void;
}

/** Which transfer rows are waiting, and why. The panel reads this to show the message and "Try again". */
export const useTransferWait = create<TransferWaitState>((set) => ({
  waits: {},
  set: (key, reason) =>
    set((s) => (s.waits[key] === reason ? s : { waits: { ...s.waits, [key]: reason } })),
  clear: (key) =>
    set((s) => {
      if (!(key in s.waits)) return s;
      const { [key]: _gone, ...rest } = s.waits;
      return { waits: rest };
    }),
  clearAll: () => set((s) => (Object.keys(s.waits).length ? { waits: {} } : s)),
}));

/**
 * Apply an engine progress event to the wait state: a `waiting` stage marks the
 * row, any other stage clears it. The desktop and Android engines report their
 * own pauses this way.
 */
export function applyEngineWait(key: string, progress: { stage: string; waiting?: unknown }): void {
  const { set, clear } = useTransferWait.getState();
  if (progress.stage === "waiting") {
    set(key, isWaitReason(progress.waiting) ? progress.waiting : WaitReason.TelegramBlocked);
  } else {
    clear(key);
  }
}
