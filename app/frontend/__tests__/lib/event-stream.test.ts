import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  addEventListener(type: string, cb: (e: { data: string }) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string) {
    this.listeners[type]?.forEach((cb) => cb({ data }));
  }
}

vi.mock("@/lib/api", () => ({ createEventSource: vi.fn(() => new FakeEventSource()) }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: vi.fn(() => Promise.resolve("new")) }));

let mockToken: string | null = null;
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ accessToken: mockToken }) },
}));

import { subscribeEvents, tokenExpiresSoon } from "@/lib/event-stream";
import { createEventSource } from "@/lib/api";
import { tryRefreshToken } from "@/lib/auth-fetch";

const created = () => vi.mocked(createEventSource).mock.results.map((r) => r.value as FakeEventSource);
const latest = () => created().at(-1)!;

function jwt(exp: number | undefined): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(exp === undefined ? {} : { exp })}.sig`;
}

let unsubs: Array<() => void> = [];
function sub(...args: Parameters<typeof subscribeEvents>) {
  const u = subscribeEvents(...args);
  unsubs.push(u);
  return u;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockToken = null;
});

afterEach(() => {
  unsubs.forEach((u) => u());
  unsubs = [];
  vi.useRealTimers();
});

describe("tokenExpiresSoon", () => {
  const now = 1_000_000_000_000;
  it("is true for an expired or nearly expired token", () => {
    expect(tokenExpiresSoon(jwt(now / 1000 - 5), now)).toBe(true);
    expect(tokenExpiresSoon(jwt(now / 1000 + 10), now)).toBe(true);
  });
  it("is false for a fresh token, a token without exp, or garbage", () => {
    expect(tokenExpiresSoon(jwt(now / 1000 + 600), now)).toBe(false);
    expect(tokenExpiresSoon(jwt(undefined), now)).toBe(false);
    expect(tokenExpiresSoon("not-a-jwt", now)).toBe(false);
  });
  it("defaults now to the current time", () => {
    expect(tokenExpiresSoon(jwt(Math.floor(Date.now() / 1000) - 1))).toBe(true);
  });
});

describe("subscribeEvents", () => {
  it("shares one EventSource across subscribers and fans events out by type", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    sub({ file: a });
    sub({ file: b, clipboard: c });
    expect(createEventSource).toHaveBeenCalledTimes(1);
    latest().emit("file", "1");
    latest().emit("clipboard", "2");
    expect(a).toHaveBeenCalledWith({ data: "1" });
    expect(b).toHaveBeenCalledWith({ data: "1" });
    expect(c).toHaveBeenCalledWith({ data: "2" });
  });

  it("closes the stream when the last subscriber leaves and reopens on the next", () => {
    const u1 = sub({ file: vi.fn() });
    const u2 = sub({ file: vi.fn() });
    const es = latest();
    u1();
    u1();
    expect(es.closed).toBe(false);
    u2();
    expect(es.closed).toBe(true);
    sub({ file: vi.fn() });
    expect(createEventSource).toHaveBeenCalledTimes(2);
  });

  it("stops delivering to an unsubscribed handler while others keep receiving", () => {
    const gone = vi.fn();
    const kept = vi.fn();
    const u = sub({ file: gone });
    sub({ audit: kept });
    u();
    latest().emit("file", "x");
    latest().emit("audit", "y");
    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("reports first open vs reconnect, and drop counts that reset on open", async () => {
    const onOpen = vi.fn();
    const onError = vi.fn();
    sub({ file: vi.fn() }, { onOpen, onError });
    sub({ file: vi.fn() });
    latest().onopen?.();
    expect(onOpen).toHaveBeenLastCalledWith(false);

    latest().onerror?.();
    expect(onError).toHaveBeenLastCalledWith(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(createEventSource).toHaveBeenCalledTimes(2);
    latest().onerror?.();
    expect(onError).toHaveBeenLastCalledWith(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(createEventSource).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(createEventSource).toHaveBeenCalledTimes(3);

    latest().onopen?.();
    expect(onOpen).toHaveBeenLastCalledWith(true);
    latest().onerror?.();
    expect(onError).toHaveBeenLastCalledWith(0);
  });

  it("caps the backoff at 30s", async () => {
    sub({ file: vi.fn() });
    for (let i = 0; i < 6; i++) {
      latest().onerror?.();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    const before = created().length;
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(created().length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(created().length).toBe(before + 1);
  });

  it("re-attaches every subscribed type on reconnect, and attaches late subscribers live", async () => {
    const late = vi.fn();
    sub({ file: vi.fn() });
    sub({ clipboard: late });
    latest().emit("clipboard", "a");
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    latest().emit("clipboard", "b");
    expect(late).toHaveBeenCalledTimes(2);
  });

  it("ignores a second error from an already-replaced source", async () => {
    sub({ file: vi.fn() });
    const first = latest();
    first.onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    const second = latest();
    first.onerror?.();
    expect(second.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(createEventSource).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired access token before reconnecting", async () => {
    mockToken = jwt(Math.floor(Date.now() / 1000) - 60);
    sub({ file: vi.fn() });
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tryRefreshToken).toHaveBeenCalledTimes(1);
    expect(createEventSource).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a fresh token or when signed out", async () => {
    mockToken = jwt(Math.floor(Date.now() / 1000) + 600);
    sub({ file: vi.fn() });
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    mockToken = null;
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tryRefreshToken).not.toHaveBeenCalled();
    expect(createEventSource).toHaveBeenCalledTimes(3);
  });

  it("does not reconnect after everyone unsubscribed, even mid-refresh", async () => {
    mockToken = jwt(Math.floor(Date.now() / 1000) - 60);
    let release!: (v: string) => void;
    vi.mocked(tryRefreshToken).mockReturnValueOnce(new Promise((r) => (release = r)));
    const u = sub({ file: vi.fn() });
    latest().onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    u();
    release("tok");
    await vi.advanceTimersByTimeAsync(0);
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending reconnect timer when the last subscriber leaves", async () => {
    const u = sub({ file: vi.fn() });
    latest().onerror?.();
    u();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("ignores an error from a source closed by teardown", async () => {
    const u = sub({ file: vi.fn() });
    const es = latest();
    u();
    es.onerror?.();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });
});
