const PROBE_URL = "https://api.telegram.org/";
const CACHE_KEY = "zcrypt:telegram-reach";
const CACHE_FOR_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 6000;

export type TelegramReach = "ok" | "blocked";

function cached(): TelegramReach | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, reach } = JSON.parse(raw) as { at: number; reach: TelegramReach };
    return Date.now() - at < CACHE_FOR_MS ? reach : null;
  } catch {
    return null;
  }
}

function remember(reach: TelegramReach) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), reach }));
  } catch {
    // Without storage the check just runs again on the next page load.
  }
}

/**
 * Whether this browser can reach Telegram at all. Countries and networks that
 * block Telegram drop or reset the connection, so an opaque no-cors response
 * means reachable and a network error or timeout means blocked. Only an
 * unreachable result offline is ambiguous, so offline reports "ok" and leaves
 * the connection banner to explain.
 */
export async function probeTelegram(force = false): Promise<TelegramReach> {
  if (!force) {
    const hit = cached();
    if (hit) return hit;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "ok";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let reach: TelegramReach;
  try {
    await fetch(PROBE_URL, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    reach = "ok";
  } catch {
    reach = "blocked";
  } finally {
    clearTimeout(timer);
  }
  remember(reach);
  return reach;
}
