import { describe, it, expect, vi, afterEach } from "vitest";
import { isTransientError, retryTransient } from "@/lib/retry";

describe("isTransientError", () => {
  it("never retries an abort", () => {
    expect(isTransientError(new DOMException("cancelled", "AbortError"))).toBe(false);
  });

  it.each([
    "Network request failed",
    "Request timed out",
    "connection timeout",
    "Connection stalled",
    "Too Many Requests",
    "please slow down",
    "temporarily unavailable",
    "Service unavailable",
    "Error 502 Bad Gateway",
    "500 Internal Server Error",
  ])("treats %j as transient", (message) => {
    expect(isTransientError(new Error(message))).toBe(true);
  });

  it("does not treat an unrelated error as transient", () => {
    expect(isTransientError(new Error("invalid credentials"))).toBe(false);
  });

  it("does not match a 4xx as a 5xx", () => {
    expect(isTransientError(new Error("404 not found"))).toBe(false);
  });

  it("stringifies non-Error values before matching", () => {
    expect(isTransientError("network request failed")).toBe(true);
    expect(isTransientError("just a plain string")).toBe(false);
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
      .mockRejectedValueOnce(new Error("network request failed"))
      .mockRejectedValueOnce(new Error("503 unavailable"))
      .mockResolvedValueOnce("recovered");

    const promise = retryTransient(fn, { maxRetries: 5 });
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries and throws the last transient error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error("timed out"));

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
