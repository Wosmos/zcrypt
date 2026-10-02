import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProgressEvent } from "@/types";
import type { AuditEvent } from "@/lib/auth-api";
import type { StreamObserver } from "@/lib/event-stream";

type Listeners = Record<string, (e: { data: string }) => void>;
const subs: { listeners: Listeners; observer: StreamObserver; unsubscribe: ReturnType<typeof vi.fn> }[] = [];

vi.mock("@/lib/event-stream", () => ({
  subscribeEvents: vi.fn((listeners: Listeners, observer: StreamObserver) => {
    const unsubscribe = vi.fn();
    subs.push({ listeners, observer, unsubscribe });
    return unsubscribe;
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
import { subscribeEvents } from "@/lib/event-stream";
import { notifications } from "@/store/notifications";
import { toast } from "@/store/toast";

class MockNotification {
  static permission: NotificationPermission = "granted";
  static instances: MockNotification[] = [];
  constructor() {
    MockNotification.instances.push(this);
  }
}

const latest = () => subs.at(-1)!;
const emit = (type: string, data: string) => latest().listeners[type]!({ data });

describe("useOperationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subs.length = 0;
    MockNotification.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes exactly once on mount", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("forwards a valid progress event to the latest callback", () => {
    const first = vi.fn();
    const onProgress = vi.fn();
    const { rerender } = renderHook(({ cb }) => useOperationStatus(cb), { initialProps: { cb: first } });
    rerender({ cb: onProgress });
    const data: ProgressEvent = {
      file_id: "f1",
      stage: "upload",
      percent: 50,
      bytes_processed: 5,
      total_bytes: 10,
    };
    emit("progress", JSON.stringify(data));
    expect(onProgress).toHaveBeenCalledWith(data);
    expect(first).not.toHaveBeenCalled();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("swallows a malformed progress payload without calling the callback", () => {
    const onProgress = vi.fn();
    renderHook(() => useOperationStatus(onProgress));
    expect(() => emit("progress", "{not json")).not.toThrow();
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
    emit("audit", JSON.stringify(data));
    expect(onAudit).toHaveBeenCalledWith(data);
  });

  it("swallows a malformed audit payload without throwing", () => {
    const onAudit = vi.fn();
    renderHook(() => useOperationStatus(vi.fn(), onAudit));
    expect(() => emit("audit", "{not json")).not.toThrow();
    expect(onAudit).not.toHaveBeenCalled();
  });

  it("does not throw on an audit event when no onAudit callback was given", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    expect(() => emit("audit", JSON.stringify({ id: "a1" }))).not.toThrow();
  });

  it("does not announce a reconnect when no warning was shown", () => {
    renderHook(() => useOperationStatus(vi.fn()));
    latest().observer.onOpen?.(false);
    latest().observer.onOpen?.(true);
    expect(notifications.serverReconnected).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("warns once only after a sustained outage, never via the OS, then announces reconnect", () => {
    vi.stubGlobal("Notification", MockNotification);
    renderHook(() => useOperationStatus(vi.fn()));
    const { onError, onOpen } = latest().observer;

    for (let i = 0; i < 8; i++) onError?.(i);
    expect(notifications.serverError).not.toHaveBeenCalled();

    onError?.(8);
    onError?.(9);
    expect(notifications.serverError).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(MockNotification.instances).toHaveLength(0);

    onOpen?.(true);
    expect(notifications.serverReconnected).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);

    onOpen?.(true);
    expect(notifications.serverReconnected).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useOperationStatus(vi.fn()));
    unmount();
    expect(latest().unsubscribe).toHaveBeenCalledTimes(1);
  });
});
