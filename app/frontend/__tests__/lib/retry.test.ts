import { describe, it, expect, vi, afterEach } from "vitest";
import { isTransientError, retryTransient } from "@/lib/retry";
import { ApiError } from "@/lib/http-error";
import { PausedError, StalledError } from "@/lib/transport";

describe("isTransientError", () => {
  it("never retries an abort", () => {
    expect(isTransientError(new DOMException("cancelled", "AbortError"))).toBe(false);
  });

  it("treats a network failure (TypeError) as transient", () => {
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("treats a stall or control timeout as transient", () => {
    expect(isTransientError(new StalledError())).toBe(true);
  });

  it("never grep message text: a plain error is not transient whatever it says", () => {
    for (const m of ["Network request failed", "timed out", "503 unavailable", "Too Many Requests"]) {
      expect(isTransientError(new Error(m))).toBe(false);
    }
  });

  it("reads 'chunk 412 download timed out' as a stall, never as a 4xx", () => {
    expect(isTransientError(new StalledError("chunk 412 download timed out"))).toBe(true);
    expect(isTransientError(new ApiError("chunk 412 download timed out", 412))).toBe(false);
  });

  it("never retries a pause", () => {
    expect(isTransientError(new PausedError())).toBe(false);
  });

  it("treats a status-carrying error from another layer by its status", () => {
    expect(isTransientError(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error("x"), { status: 404 }))).toBe(false);
  });

  it.each([408, 429, 500, 502, 503])("retries an HTTP %i by status, whatever the body says", (status) => {
    expect(isTransientError(new ApiError("upload failed", status))).toBe(true);
  });

  it.each([400, 401, 404, 409, 410])("never retries an HTTP %i, even with a transient-sounding body", (status) => {
    expect(isTransientError(new ApiError("service temporarily unavailable", status))).toBe(false);
  });

});

describe("retryTransient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryTransient(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately without calling fn when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();

    await expect(retryTransient(fn, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("rethrows an AbortError from fn immediately, without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));

    await expect(retryTransient(fn)).rejects.toMatchObject({ name: "AbortError" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws a non-transient error immediately, without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("invalid credentials"));

    await expect(retryTransient(fn)).rejects.toThrow("invalid credentials");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient error with backoff and eventually succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network request failed"))
      .mockRejectedValueOnce(new ApiError("unavailable", 503))
      .mockResolvedValueOnce("recovered");

    const promise = retryTransient(fn, { maxRetries: 5 });
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries and throws the last transient error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new StalledError("timed out"));

    const promise = retryTransient(fn, { maxRetries: 2 });
    // swallow the eventual rejection so it isn't reported as unhandled while
    // timers are advanced below
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });
});

describe("retryTransient: shared rule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits at least the Retry-After a 429 asked for", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new ApiError("slow down", 429, 20)).mockResolvedValue("ok");
    const promise = retryTransient(fn);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toBe("ok");
  });

  it("retries a 502, 503 and 504 but not a 403", async () => {
    vi.useFakeTimers();
    for (const status of [502, 503, 504]) {
      const fn = vi.fn().mockRejectedValueOnce(new ApiError("x", status)).mockResolvedValue("ok");
      const p = retryTransient(fn);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(p).resolves.toBe("ok");
    }
    const denied = vi.fn().mockRejectedValue(new ApiError("expired", 403));
    await expect(retryTransient(denied)).rejects.toMatchObject({ status: 403 });
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it("stops with the given error when shouldStop turns true, before the next attempt", async () => {
    vi.useFakeTimers();
    let stop = false;
    const fn = vi.fn().mockImplementation(async () => {
      stop = true;
      throw new StalledError();
    });
    const promise = retryTransient(fn, { shouldStop: () => stop, stopError: () => new PausedError() });
    await expect(promise).rejects.toBeInstanceOf(PausedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ends a backoff sleep when the signal aborts", async () => {
    vi.useFakeTimers();
    const ctl = new AbortController();
    const fn = vi.fn().mockRejectedValue(new StalledError());
    const promise = retryTransient(fn, { signal: ctl.signal });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(10);
    ctl.abort();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
