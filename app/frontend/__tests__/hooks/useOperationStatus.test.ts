import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProgressEvent } from "@/types";
import type { AuditEvent } from "@/lib/auth-api";

vi.mock("@/lib/api", () => ({
  createEventSource: vi.fn(() => {
    class FakeEventSource {
      url = "";
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

vi.mock("@/store/notifications", () => ({
  notifications: {
    serverReconnected: vi.fn(),
    serverError: vi.fn(),
  },
}));

vi.mock("@/store/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useOperationStatus } from "@/hooks/useOperationStatus";
import { createEventSource } from "@/lib/api";
import { notifications } from "@/store/notifications";
import { toast } from "@/store/toast";

type FakeES = {
  url: string;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  closed: boolean;
  close: () => void;
  emit: (type: string, data: string) => void;
};

class MockNotification {
  static permission: NotificationPermission = "granted";
  static instances: MockNotification[] = [];
  title: string;
  options?: Record<string, unknown>;
  onclick: (() => void) | null = null;
  closeCalled = false;
  constructor(title: string, options?: Record<string, unknown>) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }
  close() {
    this.closeCalled = true;
  }
}

function latestES(): FakeES {
  const calls = (createEventSource as ReturnType<typeof vi.fn>).mock.results;
  return calls[calls.length - 1]!.value as FakeES;
}

describe("useOperationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockNotification.instances = [];
    MockNotification.permission = "granted";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens exactly one connection on mount", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    expect(createEventSource).toHaveBeenCalledTimes(1);
  });

  it("forwards a valid progress event to the callback", () => {
    const onProgress = vi.fn();
    renderHook(() => useOperationStatus(onProgress));
    const data: ProgressEvent = {
      file_id: "f1",
      stage: "upload",
      percent: 50,
      bytes_processed: 5,
      total_bytes: 10,
    };
    latestES().emit("progress", JSON.stringify(data));
    expect(onProgress).toHaveBeenCalledWith(data);
  });

  it("swallows a malformed progress payload without calling the callback", () => {
    const onProgress = vi.fn();
    renderHook(() => useOperationStatus(onProgress));
    expect(() => latestES().emit("progress", "{not json")).not.toThrow();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("forwards a valid audit event when a callback is provided", () => {
    const onAudit = vi.fn();
    renderHook(() => useOperationStatus(vi.fn(), onAudit));
    const data: AuditEvent = {
      id: "a1",
      event_type: "login",
      ip: "127.0.0.1",
      user_agent: "test",
      metadata: {},
      created_at: "now",
    };
    latestES().emit("audit", JSON.stringify(data));
    expect(onAudit).toHaveBeenCalledWith(data);
  });

  it("swallows a malformed audit payload without throwing", () => {
    const onAudit = vi.fn();
    renderHook(() => useOperationStatus(vi.fn(), onAudit));
    expect(() => latestES().emit("audit", "{not json")).not.toThrow();
    expect(onAudit).not.toHaveBeenCalled();
  });

  it("does not throw on an audit event when no onAudit callback was given", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    expect(() =>
      latestES().emit("audit", JSON.stringify({ id: "a1" }))
    ).not.toThrow();
  });

  it("does not announce a reconnect on the very first successful open", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    latestES().onopen?.();
    expect(notifications.serverReconnected).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("warns once only after a SUSTAINED outage (threshold), then announces reconnect", () => {
    vi.useFakeTimers();
    vi.stubGlobal("Notification", MockNotification);

    renderHook(() => useOperationStatus(vi.fn()));

    latestES().onopen?.(); // establish hadConnection

    // Threshold is 8 consecutive failures (~2 min of 1s->30s backoff). Every
    // failure below it stays silent — a normal SSE reconnect recovers well
    // before then and must not warn.
    for (let i = 0; i < 8; i++) {
      latestES().onerror?.();
      expect(notifications.serverError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
    }

    latestES().onerror?.(); // 9th failure — threshold crossed
    expect(notifications.serverError).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    // An SSE drop must NEVER raise an OS-level notification — it auto-recovers,
    // and one lingering in the notification centre is pure noise.
    expect(MockNotification.instances).toHaveLength(0);

    vi.advanceTimersByTime(30_000);
    latestES().onopen?.();
    expect(notifications.serverReconnected).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("never raises an OS notification even when Notification permission is granted", () => {
    vi.useFakeTimers();
    MockNotification.permission = "granted";
    vi.stubGlobal("Notification", MockNotification);
    renderHook(() => useOperationStatus(vi.fn()));

    for (let i = 0; i < 9; i++) {
      latestES().onerror?.();
      vi.advanceTimersByTime(30_000);
    }

    expect(notifications.serverError).toHaveBeenCalledTimes(1);
    expect(MockNotification.instances).toHaveLength(0);
  });

  it("surfaces the in-app warning without touching the Notification API", () => {
    vi.useFakeTimers();
    renderHook(() => useOperationStatus(vi.fn()));

    for (let i = 0; i < 9; i++) {
      latestES().onerror?.();
      vi.advanceTimersByTime(30_000);
    }

    expect(notifications.serverError).toHaveBeenCalledTimes(1);
  });

  it("caps the reconnect backoff at 30s", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    renderHook(() => useOperationStatus(vi.fn()));

    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of delays) {
      latestES().onerror?.();
      expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), delay);
      vi.advanceTimersByTime(delay);
    }
  });

  it("closes the socket and cancels a pending reconnect on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = renderHook(() => useOperationStatus(vi.fn()));
    const es = latestES();
    latestES().onerror?.(); // schedules a reconnect timer

    unmount();
    expect(es.closed).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    const countBefore = (createEventSource as ReturnType<typeof vi.fn>).mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect((createEventSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(countBefore);
  });

  it("unmounts cleanly with no pending reconnect timer to clear", () => {
    const { unmount } = renderHook(() => useOperationStatus(vi.fn()));
    const es = latestES();
    expect(() => unmount()).not.toThrow();
    expect(es.closed).toBe(true);
  });

  it("no-ops a reconnect timer orphaned by a second error before it fired, once disposed", () => {
    // Two onerror calls in a row (re)assign the closure's single `reconnectTimer`
    // variable, so the FIRST timer (1s) is orphaned — still pending, but no
    // longer referenced — while the SECOND timer (2s) is what cleanup tracks
    // and clears. Unmounting clears only the tracked (2s) timer; the orphaned
    // (1s) one still fires and invokes `connect()` with `disposed` already
    // true, which must no-op instead of opening a new EventSource.
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useOperationStatus(vi.fn()));
    const es = latestES();

    es.onerror?.(); // schedules the orphan-to-be at 1s
    es.onerror?.(); // schedules the tracked timer at 2s, orphaning the first

    unmount(); // disposed = true; clears only the tracked 2s timer

    const countBefore = (createEventSource as ReturnType<typeof vi.fn>).mock.calls.length;
    vi.advanceTimersByTime(1000); // the orphaned 1s timer fires connect()
    expect((createEventSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(countBefore);
  });

  it("ignores a stray error event that arrives after unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useOperationStatus(vi.fn()));
    const es = latestES();
    unmount();

    const countBefore = (createEventSource as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(() => es.onerror?.()).not.toThrow();
    vi.advanceTimersByTime(60_000);
    expect((createEventSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(countBefore);
  });
});
