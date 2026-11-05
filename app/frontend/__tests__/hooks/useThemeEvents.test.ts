import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: MessageEvent) => void>,
  observer: {} as { onOpen?: (reconnected: boolean) => void },
  unsubscribe: vi.fn(),
  applyRemote: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("@/lib/event-stream", () => ({
  subscribeEvents: (
    handlers: Record<string, (e: MessageEvent) => void>,
    observer: { onOpen?: (reconnected: boolean) => void },
  ) => {
    h.handlers = handlers;
    h.observer = observer;
    return h.unsubscribe;
  },
}));
vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ applyRemotePreference: h.applyRemote, reloadPreference: h.reload }),
}));

import { useThemeEvents } from "@/hooks/useThemeEvents";

const message = (data: string) => ({ data }) as MessageEvent;

describe("useThemeEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies an account theme pushed from another device", () => {
    renderHook(() => useThemeEvents());
    h.handlers.preferences(message('{"device_id":"other","color_theme":"ocean","mode":"dark"}'));
    expect(h.applyRemote).toHaveBeenCalledWith({ device_id: "other", color_theme: "ocean", mode: "dark" });
  });

  it("ignores a malformed event", () => {
    renderHook(() => useThemeEvents());
    h.handlers.preferences(message("not json"));
    expect(h.applyRemote).not.toHaveBeenCalled();
  });

  it("re-reads the theme only after a reconnect, since changes made while offline were missed", () => {
    renderHook(() => useThemeEvents());
    h.observer.onOpen?.(false);
    expect(h.reload).not.toHaveBeenCalled();
    h.observer.onOpen?.(true);
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useThemeEvents());
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
});
