/**
 * The shared transfer rule, mirrored from app/core/src/transport.rs and
 * app/backend/transport: a transfer fails only after IDLE_TIMEOUT_MS with no
 * bytes moving, never because it took long overall. Small JSON control calls
 * keep a short total limit (CONTROL_TIMEOUT_MS). Only transient failures are
 * retried, with exponential backoff and jitter.
 */

export const IDLE_TIMEOUT_MS = 60_000;
export const CONTROL_TIMEOUT_MS = 30_000;
export const RETRY_BASE_MS = 1_000;
export const RETRY_CAP_MS = 15_000;
export const RETRY_AFTER_CAP_MS = 300_000;
export const MAX_RETRIES = 5;
export const DIRECT_UNREACHABLE_FOR_MS = 10 * 60_000;
export const FILE_PATH_TTL_MS = 50 * 60_000;

/** No bytes moved for the idle limit, or a control call ran past its total limit. */
export class StalledError extends Error {
  constructor(message = "Transfer stalled: no bytes moved") {
    super(message);
    this.name = "StalledError";
  }
}

/** Thrown (never retried) when a transfer stops because the user paused. */
export class PausedError extends Error {
  constructor() {
    super("Upload paused");
    this.name = "PausedError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function isPauseError(err: unknown): boolean {
  return err instanceof PausedError;
}

/** Exponential backoff with jitter: a random point in the upper half of the capped delay. */
export function backoffMs(attempt: number, base = RETRY_BASE_MS, cap = RETRY_CAP_MS): number {
  const d = Math.min(base * 2 ** Math.min(attempt, 16), cap);
  return d / 2 + Math.random() * (d / 2);
}

/** The wait a server asked for with Retry-After (seconds), capped. */
export function retryAfterMs(err: unknown): number {
  const secs = (err as { retryAfter?: number } | null)?.retryAfter;
  return typeof secs === "number" && secs > 0 ? Math.min(secs * 1000, RETRY_AFTER_CAP_MS) : 0;
}

/** Sleep that rejects with an AbortError as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface Watch {
  /** Pass to fetch: aborts on the caller's abort or when the watchdog fires. */
  signal: AbortSignal;
  /** Bytes moved: restarts the idle clock. */
  touch(): void;
  /** Turn an abort rejection into the caller's AbortError or a StalledError. */
  translate(err: unknown): unknown;
  dispose(): void;
}

function watch(caller: AbortSignal | undefined, ms: number, resets: boolean): Watch {
  const ctrl = new AbortController();
  let fired = false;
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      ctrl.abort();
    }, ms);
  };
  const onCaller = () => ctrl.abort();
  if (caller?.aborted) ctrl.abort();
  else caller?.addEventListener("abort", onCaller, { once: true });
  arm();
  return {
    signal: ctrl.signal,
    touch: () => {
      if (resets && !ctrl.signal.aborted) arm();
    },
    translate: (err) => {
      if (caller?.aborted)
        return isAbortError(err) ? err : new DOMException("Cancelled", "AbortError");
      if (fired && (isAbortError(err) || ctrl.signal.aborted)) {
        return new StalledError(
          resets
            ? `Transfer stalled: no bytes moved for ${Math.round(ms / 1000)}s`
            : `Request timed out after ${Math.round(ms / 1000)}s`,
        );
      }
      return err;
    },
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCaller);
    },
  };
}

/** Watchdog that restarts on every `touch()`: the idle rule. */
export function idleWatch(caller?: AbortSignal, idleMs = IDLE_TIMEOUT_MS): Watch {
  return watch(caller, idleMs, true);
}

/** Run a small control call under a fixed total limit, forwarding the caller's abort. */
export async function withControlTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  caller?: AbortSignal,
  ms = CONTROL_TIMEOUT_MS,
): Promise<T> {
  const w = watch(caller, ms, false);
  try {
    return await run(w.signal);
  } catch (err) {
    throw w.translate(err);
  } finally {
    w.dispose();
  }
}

/** Read a JSON response body under the same total limit as the call that
 *  produced it: headers arriving does not end the control timeout. */
export async function readJsonControl<T>(
  res: Response,
  caller?: AbortSignal,
  ms = CONTROL_TIMEOUT_MS,
): Promise<T> {
  const w = watch(caller, ms, false);
  try {
    return await new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        void res.body?.cancel?.().catch(() => {});
        reject(new DOMException("Cancelled", "AbortError"));
      };
      if (w.signal.aborted) onAbort();
      else w.signal.addEventListener("abort", onAbort, { once: true });
      (res.json() as Promise<T>).then(resolve, reject);
    });
  } catch (err) {
    throw w.translate(err);
  } finally {
    w.dispose();
  }
}

/** Read a response body, restarting the idle clock on every chunk that arrives. */
export async function readBodyIdle(res: Response, w: Watch): Promise<ArrayBuffer> {
  const reader = res.body?.getReader?.();
  if (!reader) return res.arrayBuffer();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    w.touch();
    parts.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out.buffer;
}

/**
 * Fetch and read a whole body under the idle rule. `doFetch` receives the
 * signal to pass on; `onError` turns a non-ok response into the caller's error.
 * A caller abort stays an AbortError; no movement for the idle limit is a
 * StalledError.
 */
export async function fetchIdleBody(
  doFetch: (signal: AbortSignal) => Promise<Response>,
  onError: (res: Response) => Promise<never>,
  opts: { signal?: AbortSignal; idleMs?: number } = {},
): Promise<{ res: Response; body: ArrayBuffer }> {
  const w = idleWatch(opts.signal, opts.idleMs);
  try {
    const res = await doFetch(w.signal);
    w.touch();
    if (!res.ok) await onError(res);
    return { res, body: await readBodyIdle(res, w) };
  } catch (err) {
    throw w.translate(err);
  } finally {
    w.dispose();
  }
}

export const AUTO_RESUME_MAX_ATTEMPTS = 5;
export const AUTO_RESUME_BASE_MS = 4_000;
export const AUTO_RESUME_CAP_MS = 60_000;
export const AUTO_RESUME_TICK_MS = 15_000;
export const FAILED_BUFFER_GRACE_MS = 5 * 60_000;
