import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNotifications } from "@/hooks/useNotifications";

interface FakeNotificationInstance {
  title: string;
  options?: NotificationOptions;
  close: ReturnType<typeof vi.fn>;
  onclick: (() => void) | null;
}

function makeFakeNotificationCtor(permission: NotificationPermission) {
  const instances: FakeNotificationInstance[] = [];
  function Ctor(this: FakeNotificationInstance, title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    this.close = vi.fn();
    this.onclick = null;
    instances.push(this);
  }
  Ctor.permission = permission;
  Ctor.requestPermission = vi.fn();
  Ctor.instances = instances;
  return Ctor as unknown as typeof Notification & {
    instances: FakeNotificationInstance[];
    requestPermission: ReturnType<typeof vi.fn>;
  };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

describe("useNotifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { hidden?: boolean }).hidden;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("when Notification is unsupported (default jsdom environment)", () => {
    it("reports unsupported and ungranted", () => {
      const { result } = renderHook(() => useNotifications());
      expect(result.current.isSupported).toBe(false);
      expect(result.current.isGranted).toBe(false);
    });

    it("requestPermission resolves false without throwing", async () => {
      const { result } = renderHook(() => useNotifications());
      await expect(result.current.requestPermission()).resolves.toBe(false);
    });

    it("notify is a no-op", () => {
      const { result } = renderHook(() => useNotifications());
      expect(() => result.current.notify("hello")).not.toThrow();
    });
  });

  describe("when Notification is supported", () => {
    beforeEach(() => {
      setDocumentHidden(false);
    });

    it("reports supported, and granted only when permission is granted", () => {
      vi.stubGlobal("Notification", makeFakeNotificationCtor("default"));
      const { result: notGranted } = renderHook(() => useNotifications());
      expect(notGranted.current.isSupported).toBe(true);
      expect(notGranted.current.isGranted).toBe(false);

      vi.stubGlobal("Notification", makeFakeNotificationCtor("granted"));
      const { result: granted } = renderHook(() => useNotifications());
      expect(granted.current.isGranted).toBe(true);
    });

    it("requestPermission short-circuits true when already granted", async () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      const { result } = renderHook(() => useNotifications());

      await expect(result.current.requestPermission()).resolves.toBe(true);
      expect(ctor.requestPermission).not.toHaveBeenCalled();
    });

    it("requestPermission short-circuits false when already denied", async () => {
      const ctor = makeFakeNotificationCtor("denied");
      vi.stubGlobal("Notification", ctor);
      const { result } = renderHook(() => useNotifications());

      await expect(result.current.requestPermission()).resolves.toBe(false);
      expect(ctor.requestPermission).not.toHaveBeenCalled();
    });

    it("requestPermission asks the browser when permission is default, and returns true on grant", async () => {
      const ctor = makeFakeNotificationCtor("default");
      ctor.requestPermission.mockResolvedValueOnce("granted");
      vi.stubGlobal("Notification", ctor);
      const { result } = renderHook(() => useNotifications());

      await expect(result.current.requestPermission()).resolves.toBe(true);
      expect(ctor.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("requestPermission returns false when the browser prompt is declined", async () => {
      const ctor = makeFakeNotificationCtor("default");
      ctor.requestPermission.mockResolvedValueOnce("denied");
      vi.stubGlobal("Notification", ctor);
      const { result } = renderHook(() => useNotifications());

      await expect(result.current.requestPermission()).resolves.toBe(false);
    });

    it("notify no-ops when permission is not granted", () => {
      const ctor = makeFakeNotificationCtor("default");
      vi.stubGlobal("Notification", ctor);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("hi");
      expect(ctor.instances.length).toBe(0);
    });

    it("notify no-ops when the tab is focused and always is not set", () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(false);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("hi");
      expect(ctor.instances.length).toBe(0);
    });

    it("notify fires when the tab is hidden", () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(true);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("New file", { body: "uploaded.txt" });
      expect(ctor.instances.length).toBe(1);
      expect(ctor.instances[0].title).toBe("New file");
      expect(ctor.instances[0].options).toEqual({
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        body: "uploaded.txt",
      });
    });

    it("notify fires when always=true even if the tab is focused, and strips `always` from the options", () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(false);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("Ping", { always: true, body: "hey" });
      expect(ctor.instances.length).toBe(1);
      expect(ctor.instances[0].options).toEqual({
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        body: "hey",
      });
    });

    it("custom icon/badge overrides the defaults", () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(true);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("t", { icon: "/custom.png" });
      expect(ctor.instances[0].options?.icon).toBe("/custom.png");
      expect(ctor.instances[0].options?.badge).toBe("/favicon.ico");
    });

    it("auto-closes the notification after 5 seconds", () => {
      vi.useFakeTimers();
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(true);
      const { result } = renderHook(() => useNotifications());

      result.current.notify("t");
      const n = ctor.instances[0];
      expect(n.close).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(5000));
      expect(n.close).toHaveBeenCalledTimes(1);
    });

    it("focuses the window and closes the notification on click", () => {
      const ctor = makeFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", ctor);
      setDocumentHidden(true);
      const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
      const { result } = renderHook(() => useNotifications());

      result.current.notify("t");
      const n = ctor.instances[0];
      expect(typeof n.onclick).toBe("function");
      n.onclick!();

      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(n.close).toHaveBeenCalledTimes(1);
    });
  });
});
