/**
 * Bounded-concurrency fan-out for chunk downloads.
 *
 * Runs `worker(0..count-1)` with at most `limit` in flight, pulling indices off a
 * shared queue. Aborts promptly (before starting the next index) when `signal`
 * fires, throwing an AbortError so callers treat it as a cancel — not a transient
 * failure.
 *
 * Note: this is the plain all-or-throw fan-out used by the public share / bulk
 * download paths. The authenticated resumable download-session deliberately uses
 * a different (Promise.allSettled + pause/cancel) strategy to protect its resume
 * high-water mark, so it does NOT use this helper.
 */
export async function runWithConcurrency(
  count: number,
  limit: number,
  worker: (index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  const queue = Array.from({ length: count }, (_, i) => i);
  const runners: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, count); w++) {
    runners.push(
      (async () => {
        while (queue.length > 0) {
          if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
          await worker(queue.shift()!);
        }
      })()
    );
  }
  await Promise.all(runners);
}
