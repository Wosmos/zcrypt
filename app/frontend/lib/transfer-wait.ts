import { probeTelegram } from "@/lib/telegram-reach";
import { resetTelegramUnreachable } from "@/lib/telegram-download";
import { isTauri, transferRetryNow } from "@/lib/tauri";
import { useTransferWait, type WaitReason } from "@/store/transfer-wait";

/** How often waiting transfers look again for Telegram. */
export const RECHECK_MS = 10_000;

interface Waiter {
  key: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const waiters = new Set<Waiter>();
let timer: ReturnType<typeof setInterval> | null = null;
let checking: Promise<void> | null = null;

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function stopPollerIfIdle() {
  if (waiters.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function release(waiter: Waiter) {
  waiters.delete(waiter);
  useTransferWait.getState().clear(waiter.key);
  stopPollerIfIdle();
}

async function recheck(): Promise<void> {
  if (waiters.size === 0) return;
  if ((await probeTelegram(true)) !== "ok") return;
  resetTelegramUnreachable();
  for (const waiter of [...waiters]) {
    release(waiter);
    waiter.resolve();
  }
}

/**
 * Look for Telegram now, skipping the cache. One check runs at a time, so a
 * "Try again" tap during the timed check joins it instead of doubling up.
 */
export function retryWaitingNow(): Promise<void> {
  checking ??= recheck().finally(() => {
    checking = null;
  });
  return checking;
}

/**
 * The "Try again" button: check Telegram now for the transfers this tab holds,
 * and wake the desktop or Android engine's own waiting transfers too.
 */
export async function tryAgainNow(): Promise<void> {
  await Promise.allSettled([retryWaitingNow(), isTauri ? transferRetryNow() : undefined]);
}

/**
 * Hold a transfer until Telegram answers. All waiting transfers share one
 * poller that looks every RECHECK_MS; it stops when none wait. Rejects with an
 * AbortError when `signal` aborts (cancel, or pause) or on cancelAllTransferWaits.
 */
export function waitForTelegram(
  key: string,
  reason: WaitReason,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const waiter: Waiter = { key, resolve, reject };
    waiters.add(waiter);
    useTransferWait.getState().set(key, reason);
    timer ??= setInterval(() => void retryWaitingNow(), RECHECK_MS);
    signal?.addEventListener(
      "abort",
      () => {
        if (!waiters.has(waiter)) return;
        release(waiter);
        reject(abortError());
      },
      { once: true },
    );
  });
}

/** Whether any transfer in this tab is waiting for Telegram. */
export function hasTransferWaits(): boolean {
  return waiters.size > 0;
}

/** Stop every wait and the poller (logout). Each waiting transfer rejects with an AbortError. */
export function cancelAllTransferWaits(): void {
  for (const waiter of [...waiters]) {
    release(waiter);
    waiter.reject(abortError());
  }
  useTransferWait.getState().clearAll();
  stopPollerIfIdle();
}
