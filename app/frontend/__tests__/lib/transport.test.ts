import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTROL_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  StalledError,
  backoffMs,
  fetchIdleBody,
  retryAfterMs,
  withControlTimeout,
} from "@/lib/transport";
import { ApiError } from "@/lib/http-error";

afterEach(() => vi.useRealTimers());

/** A response whose body yields one chunk per `gaps` entry, waiting that long before each. */
function trickle(gaps: number[], signal: AbortSignal): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= gaps.length) {
        controller.close();
        return;
      }
      const gap = gaps[i++];
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, gap);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
      controller.enqueue(new Uint8Array([i]));
    },
  });
  return new Response(stream, { status: 200 });
}

const fail = (res: Response) => Promise.reject(new ApiError("bad", res.status));

describe("fetchIdleBody", () => {
  it("lets a body that trickles for far longer than 90s finish when it never idles 60s", async () => {
    vi.useFakeTimers();
    const gaps = Array.from({ length: 6 }, () => 50_000);
    const pending = fetchIdleBody((signal) => Promise.resolve(trickle(gaps, signal)), fail);
    await vi.advanceTimersByTimeAsync(300_000);
    const { body } = await pending;
    expect(new Uint8Array(body)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it("aborts with a StalledError once no bytes move for the idle limit", async () => {
    vi.useFakeTimers();
    const pending = fetchIdleBody((signal) => Promise.resolve(trickle([10_000, 70_000], signal)), fail);
    const assertion = expect(pending).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(10_000 + IDLE_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(2);
    await assertion;
  });

  it("does not fire before the idle limit", async () => {
    vi.useFakeTimers();
    let signalSeen!: AbortSignal;
    const pending = fetchIdleBody((signal) => {
      signalSeen = signal;
      return new Promise<Response>(() => {});
    }, fail);
    pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1);
    expect(signalSeen.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signalSeen.aborted).toBe(true);
  });

  it("keeps the caller's abort an AbortError", async () => {
    const caller = new AbortController();
    const pending = fetchIdleBody(
      (signal) =>
        new Promise<Response>((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
      fail,
      { signal: caller.signal },
    );
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(pending).rejects.not.toBeInstanceOf(StalledError);
  });

  it("turns a non-ok response into the caller's error", async () => {
    await expect(
      fetchIdleBody(() => Promise.resolve(new Response("no", { status: 503 })), fail),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("reads a body without a stream through arrayBuffer", async () => {
    const res = { ok: true, arrayBuffer: async () => new Uint8Array([7]).buffer } as Response;
    const { body } = await fetchIdleBody(() => Promise.resolve(res), fail);
    expect(new Uint8Array(body)).toEqual(new Uint8Array([7]));
  });
});

describe("withControlTimeout", () => {
  it("fails a control call that outlives the 30s total limit, even while it makes progress", async () => {
    vi.useFakeTimers();
    const pending = withControlTimeout(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS);
    await assertion;
  });

  it("forwards the caller's abort as an AbortError", async () => {
    const caller = new AbortController();
    const pending = withControlTimeout(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
      caller.signal,
    );
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns the result of a call that finishes in time", async () => {
    await expect(withControlTimeout(async () => 5)).resolves.toBe(5);
  });
});

describe("backoff and Retry-After", () => {
  it("grows exponentially into the upper half of the capped delay", () => {
    for (let a = 0; a < 8; a++) {
      const d = Math.min(1000 * 2 ** a, 15_000);
      const v = backoffMs(a);
      expect(v).toBeGreaterThanOrEqual(d / 2);
      expect(v).toBeLessThanOrEqual(d);
    }
  });

  it("honors Retry-After seconds, capped at 5 minutes", () => {
    expect(retryAfterMs(new ApiError("slow", 429, 7))).toBe(7000);
    expect(retryAfterMs(new ApiError("slow", 429, 99_999))).toBe(300_000);
    expect(retryAfterMs(new Error("x"))).toBe(0);
  });
});
