/**
 * The one retry helper for every transfer path (uploads, downloads, shares,
 * viewer). One classifier decides what is transient, by error type and HTTP
 * status and never by message text: network failures, stalls and timeouts,
 * 408, 429 (honoring Retry-After) and 5xx retry with exponential backoff and
 * jitter; an abort, a pause or any other 4xx surfaces immediately.
 */

import { isRetryableStatus } from "@/lib/http-error";
import {
  MAX_RETRIES,
  StalledError,
  backoffMs,
  isAbortError,
  isPauseError,
  retryAfterMs,
  sleep,
} from "@/lib/transport";

/** True for failures worth retrying. An HTTP error is judged by its status
 *  alone, so a 410 (data gone) never loops and a 5xx with any body retries. */
export function isTransientError(err: unknown): boolean {
  if (isAbortError(err) || isPauseError(err)) return false;
  if (err instanceof StalledError) return true;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return isRetryableStatus(status) || retryAfterMs(err) > 0;
  return err instanceof TypeError;
}

export interface RetryOptions {
  /** Cancellation: its abort ends the loop, including a backoff sleep. */
  signal?: AbortSignal;
  /** Pause check, consulted before every attempt and after every backoff. */
  shouldStop?: () => boolean;
  maxRetries?: number;
  /** Overrides the transient classifier for this call. */
  retryIf?: (err: unknown) => boolean;
  /** What to throw when stopped; defaults to an AbortError. */
  stopError?: () => Error;
}

export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  const stopped = () => opts.signal?.aborted === true || opts.shouldStop?.() === true;
  const stop = (err?: unknown): Error => {
    if (opts.stopError) return opts.stopError();
    return err instanceof Error && (isAbortError(err) || isPauseError(err))
      ? err
      : new DOMException("Cancelled", "AbortError");
  };
  for (let attempt = 0; ; attempt++) {
    if (stopped()) throw stop();
    try {
      return await fn();
    } catch (err) {
      if (isAbortError(err) || isPauseError(err) || stopped()) throw stop(err);
      if (!(opts.retryIf ?? isTransientError)(err) || attempt >= maxRetries) throw err;
      try {
        await sleep(Math.max(backoffMs(attempt), retryAfterMs(err)), opts.signal);
      } catch {
        throw stop();
      }
    }
  }
}
