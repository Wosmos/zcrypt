import { create } from "zustand";

interface HumanCheckState {
  /** A dialog that can run the check is mounted. */
  hosted: boolean;
  /** Resolves the open check; null when none is open. */
  pending: ((token: string | undefined) => void) | null;
  /** Opens the check and resolves with a Turnstile token, or undefined when it can't run or is closed. */
  ask: () => Promise<string | undefined>;
  settle: (token?: string) => void;
}

/** The step-up "confirm you're a person" check the server asks for after a burst of links. */
export const useHumanCheck = create<HumanCheckState>((set, get) => ({
  hosted: false,
  pending: null,
  ask: () => {
    if (!get().hosted) return Promise.resolve(undefined);
    get().settle();
    return new Promise((resolve) => set({ pending: resolve }));
  },
  settle: (token) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.(token);
  },
}));
