import {
  AUTO_RESUME_BASE_MS,
  AUTO_RESUME_CAP_MS,
  AUTO_RESUME_MAX_ATTEMPTS,
  backoffMs,
} from "@/lib/transport";

/**
 * Per-item budget for automatic resumes, shared by uploads and downloads: a
 * failed transfer is retried on its own at most `max` times, each after a
 * growing backoff, so a stuck item cannot loop on every focus or timer tick.
 * A manual retry, a stored or decrypted chunk, or a finished transfer resets it.
 */
export interface AutoResumeBudget {
  /** True when an attempt remains and its backoff has passed. */
  due(id: string, now?: number): boolean;
  /** Record an automatic attempt and schedule the next one. */
  spend(id: string, now?: number): void;
  reset(id: string): void;
  attempts(id: string): number;
}

export function createAutoResumeBudget(max = AUTO_RESUME_MAX_ATTEMPTS): AutoResumeBudget {
  const state = new Map<string, { attempts: number; nextAt: number }>();
  return {
    due: (id, now = Date.now()) => {
      const s = state.get(id);
      return !s || (s.attempts < max && now >= s.nextAt);
    },
    spend: (id, now = Date.now()) => {
      const attempts = (state.get(id)?.attempts ?? 0) + 1;
      state.set(id, {
        attempts,
        nextAt: now + backoffMs(attempts - 1, AUTO_RESUME_BASE_MS, AUTO_RESUME_CAP_MS),
      });
    },
    reset: (id) => {
      state.delete(id);
    },
    attempts: (id) => state.get(id)?.attempts ?? 0,
  };
}
