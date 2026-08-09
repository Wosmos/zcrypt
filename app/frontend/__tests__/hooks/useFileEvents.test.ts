import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  createEventSource: vi.fn(() => {
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
    return new FakeEventSource();
  }),
}));

vi.mock("@/lib/invalidate", () => ({
  invalidateFilesViews: vi.fn(() => Promise.resolve()),
}));

let mockAccessToken: string | null = "token";
vi.mock("@/store/auth", () => ({
  useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: mockAccessToken }),
}));

import { useFileEvents } from "@/hooks/useFileEvents";
import { createEventSource } from "@/lib/api";
import { invalidateFilesViews } from "@/lib/invalidate";

type FakeES = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  closed: boolean;
  close: () => void;
  emit: (type: string, data: string) => void;
};

function latestES(): FakeES {
  const calls = (createEventSource as ReturnType<typeof vi.fn>).mock.results;
  return calls[calls.length - 1]!.value as FakeES;
}

function setAuthenticated(authenticated: boolean) {
  mockAccessToken = authenticated ? "token" : null;
}

describe("useFileEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setAuthenticated(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not connect when unauthenticated", () => {
    setAuthenticated(false);
    renderHook(() => useFileEvents());
    expect(createEventSource).not.toHaveBeenCalled();
  });

  it("connects exactly once when authenticated", () => {
    renderHook(() => useFileEvents());
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("debounces a single file event before invalidating", () => {
    renderHook(() => useFileEvents());
    latestES().emit("file", JSON.stringify({ op: "added", file_id: "f1", rev: 1 }));

    expect(invalidateFilesViews).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of file events into a single invalidation", () => {
    renderHook(() => useFileEvents());
    const es = latestES();
    es.emit("file", JSON.stringify({ op: "added", file_id: "f1", rev: 1 }));
    vi.advanceTimersByTime(100);
    es.emit("file", JSON.stringify({ op: "updated", file_id: "f1", rev: 2 }));
    vi.advanceTimersByTime(100);
    es.emit("file", JSON.stringify({ op: "renamed", file_id: "f1", rev: 3 }));

    vi.advanceTimersByTime(299);
    expect(invalidateFilesViews).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);
  });

  it("does not throw on a malformed file event payload", () => {
    renderHook(() => useFileEvents());
    expect(() => latestES().emit("file", "{not json")).not.toThrow();
    vi.advanceTimersByTime(300);
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate on the very first successful open", () => {
    renderHook(() => useFileEvents());
    latestES().onopen?.();
    expect(invalidateFilesViews).not.toHaveBeenCalled();
  });

  it("invalidates once as a catch-up on reconnect", () => {
    renderHook(() => useFileEvents());
    const es = latestES();
    es.onopen?.(); // initial open
    es.onopen?.(); // reconnect after a drop
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);
  });

  it("closes the connection and cancels a pending debounce on unmount", () => {
    const { unmount } = renderHook(() => useFileEvents());
    const es = latestES();
    es.emit("file", JSON.stringify({ op: "deleted", file_id: "f1", rev: 4 }));

    unmount();
    expect(es.closed).toBe(true);

    vi.advanceTimersByTime(300);
    expect(invalidateFilesViews).not.toHaveBeenCalled();
  });

  it("reconnects when auth flips from unauthenticated to authenticated", () => {
    setAuthenticated(false);
    const { rerender } = renderHook(() => useFileEvents());
    expect(createEventSource).not.toHaveBeenCalled();

    setAuthenticated(true);
    rerender();
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("closes the dropped connection and reconnects after the base delay on error", () => {
    renderHook(() => useFileEvents());
    const es = latestES();
    es.onerror?.();
    expect(es.closed).toBe(true);
    expect(createEventSource).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(createEventSource).toHaveBeenCalledTimes(2);
  });

  it("doubles the reconnect delay on each consecutive error (exponential backoff)", () => {
    renderHook(() => useFileEvents());
    latestES().onerror?.();
    vi.advanceTimersByTime(1000); // 1st reconnect (delay was 1000 * 2^0)
    expect(createEventSource).toHaveBeenCalledTimes(2);

    latestES().onerror?.();
    vi.advanceTimersByTime(1000); // not enough yet — 2nd delay is 1000 * 2^1 = 2000
    expect(createEventSource).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000); // now at 2000 total
    expect(createEventSource).toHaveBeenCalledTimes(3);
  });

  it("resets the backoff attempt counter after a successful open", () => {
    renderHook(() => useFileEvents());
    latestES().onerror?.();
    vi.advanceTimersByTime(1000);
    expect(createEventSource).toHaveBeenCalledTimes(2);

    latestES().onopen?.(); // successful reconnect — resets reconnectAttempt to 0
    latestES().onerror?.();
    vi.advanceTimersByTime(1000); // back to the base delay, not the doubled one
    expect(createEventSource).toHaveBeenCalledTimes(3);
  });

  it("does not reconnect on error after unmount", () => {
    const { unmount } = renderHook(() => useFileEvents());
    const es = latestES();
    unmount();

    es.onerror?.();
    vi.advanceTimersByTime(30_000);
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending reconnect timer on unmount", () => {
    const { unmount } = renderHook(() => useFileEvents());
    latestES().onerror?.(); // schedules a reconnect timer
    unmount(); // must clearTimeout it, not let it fire later
    vi.advanceTimersByTime(30_000);
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale reconnect timer that outraces unmount", () => {
    const { unmount } = renderHook(() => useFileEvents());
    const es = latestES();
    // Two errors back-to-back schedule two timers, but only the second
    // (later) one is tracked for cancellation — the first is still pending.
    es.onerror?.();
    es.onerror?.();
    unmount(); // cancels only the tracked (later) timer
    vi.advanceTimersByTime(1000); // the untracked earlier timer now fires connect()
    expect(createEventSource).toHaveBeenCalledTimes(1); // disposed guard bails out
  });
});
