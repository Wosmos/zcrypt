/**
 * Pure TTL time helpers shared by the passphrase and folder-password caches.
 * These fold ONLY the deadline math — the two TTL stores (their timers, cache
 * shape, decrypt-cache eviction) stay separate on purpose.
 */

/** Absolute epoch-ms deadline `minutes` from now. */
export function ttlDeadline(minutes: number): number {
  return Date.now() + minutes * 60 * 1000;
}

/** Whole minutes remaining until `deadline` (rounded up); 0 for a null or
 *  already-past deadline. Mirrors the stores' getRemainingMinutes. */
export function minutesUntil(deadline: number | null): number {
  if (!deadline) return 0;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 60000);
}
