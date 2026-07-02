/**
 * Shared transient-failure retry for chunk transfers (uploads + all download
 * paths). Keeps retry behavior identical everywhere: retry network errors,
 * stalls, timeouts, rate-limits and 5xx with exponential backoff + jitter;
 * never retry an abort (cancellation) or a non-transient 4xx (which should
 * surface immediately, not loop).
 */

/** True for errors worth retrying — transport blips and server-side 5xx. */
export function isTransientError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("stalled") ||
    msg.includes("too many requests") ||
    msg.includes("slow down") ||
    msg.includes("temporarily") ||
    msg.includes("unavailable") ||
    /\b5\d\d\b/.test(msg)
  );
}

export async function retryTransient<T>(
  fn: () => Promise<T>,
  opts?: { signal?: AbortSignal; maxRetries?: number }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (opts?.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (isTransientError(err) && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 15_000) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
