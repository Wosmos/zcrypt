import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const authedFetch = vi.fn();
vi.mock("@/lib/auth-fetch", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));
vi.mock("@/lib/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/config")>()),
  API_BASE: "https://api.example.com",
}));
vi.mock("@/lib/service-worker", () => ({
  canRegisterServiceWorker: () => true,
  registerServiceWorker: async () => {},
}));

import { disablePush, enablePush, releasePushOnSignOut } from "@/lib/push";

const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

function fakeSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/abc") {
  return {
    endpoint,
    options: { applicationServerKey: null as ArrayBuffer | null },
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

let existing: ReturnType<typeof fakeSubscription> | null;
let subscribe: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

beforeEach(() => {
  existing = null;
  permission = "granted";
  subscribe = vi.fn(async () => (existing = fakeSubscription()));
  const reg = { pushManager: { getSubscription: async () => existing, subscribe } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(reg), getRegistration: async () => reg },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission: vi.fn(async () => permission),
  });
  authedFetch.mockReset();
  authedFetch.mockImplementation(async (url: string) =>
    url.endsWith("/api/push/key")
      ? new Response(JSON.stringify({ public_key: KEY }))
      : new Response("{}"),
  );
  document.documentElement.lang = "ur";
});

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (n: number) => JSON.parse(String((authedFetch.mock.calls[n][1] as RequestInit).body));

describe("web push", () => {
  it("subscribes with the server's key and registers the endpoint in the app's language", async () => {
    await expect(enablePush()).resolves.toBe("on");
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(authedFetch.mock.calls[1][0]).toBe("https://api.example.com/api/push/subscribe");
    expect(bodyOf(1)).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "p", auth: "a" },
      lang: "ur",
    });
  });

  it("stops at a refused permission without subscribing", async () => {
    permission = "denied";
    await expect(enablePush()).resolves.toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("reports an error when the server won't store the subscription", async () => {
    authedFetch.mockImplementation(async (url: string) =>
      url.endsWith("/key") ? new Response(JSON.stringify({ public_key: KEY })) : new Response("{}", { status: 400 }),
    );
    await expect(enablePush()).resolves.toBe("error");
  });

  it("turning off forgets the browser on the server and unsubscribes it", async () => {
    existing = fakeSubscription();
    await disablePush();
    expect(authedFetch.mock.calls[0][0]).toBe("https://api.example.com/api/push/unsubscribe");
    expect(bodyOf(0)).toEqual({ endpoint: existing.endpoint });
    expect(existing.unsubscribe).toHaveBeenCalled();
  });

  it("sign-out never waits more than a few seconds on push", async () => {
    vi.useFakeTimers();
    existing = fakeSubscription();
    authedFetch.mockImplementation(() => new Promise(() => {}));
    const done = releasePushOnSignOut();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("web push edge cases", () => {
  const keyBytes = () => {
    const b64 = KEY.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
  };

  it("reuses a subscription made with the same server key", async () => {
    existing = fakeSubscription();
    existing.options.applicationServerKey = keyBytes();
    await expect(enablePush()).resolves.toBe("on");
    expect(subscribe).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });

  it("replaces a subscription made with another key", async () => {
    const stale = fakeSubscription("https://fcm.googleapis.com/fcm/send/old");
    stale.options.applicationServerKey = new Uint8Array(65).buffer;
    existing = stale;
    await expect(enablePush()).resolves.toBe("on");
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
  });

  it("replaces a subscription that has no key on record", async () => {
    const stale = fakeSubscription();
    existing = stale;
    await enablePush();
    expect(stale.unsubscribe).toHaveBeenCalled();
  });

  it("asks for permission first when it hasn't been decided", async () => {
    permission = "default";
    const request = vi.fn(async () => "granted" as NotificationPermission);
    vi.stubGlobal("Notification", { permission: "default", requestPermission: request });
    await expect(enablePush()).resolves.toBe("on");
    expect(request).toHaveBeenCalled();
  });

  it("reports an error when the key can't be fetched or subscribing throws", async () => {
    authedFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(enablePush()).resolves.toBe("error");
    subscribe.mockRejectedValueOnce(new DOMException("push service down", "AbortError"));
    await expect(enablePush()).resolves.toBe("error");
  });

  it("is unsupported where the browser has no push", async () => {
    vi.stubGlobal("PushManager", undefined);
    delete (window as unknown as Record<string, unknown>).PushManager;
    await expect(enablePush()).resolves.toBe("unsupported");
  });

  it("turning off with no subscription, or a failing network, never throws", async () => {
    existing = null;
    await expect(disablePush()).resolves.toBeUndefined();
    expect(authedFetch).not.toHaveBeenCalled();
    existing = fakeSubscription();
    authedFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(disablePush()).resolves.toBeUndefined();
    expect(existing.unsubscribe).toHaveBeenCalled();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => {
          throw new Error("gone");
        },
      },
    });
    await expect(disablePush()).resolves.toBeUndefined();
  });

  it("finds no subscription when the worker isn't registered", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => undefined },
    });
    const { currentPushSubscription } = await import("@/lib/push");
    await expect(currentPushSubscription()).resolves.toBeNull();
  });
});

describe("web push fallbacks", () => {
  it("uses the browser language when the page has none", async () => {
    document.documentElement.lang = "";
    await enablePush();
    expect(bodyOf(1).lang).toBe(navigator.language);
  });

  it("has no subscription where push is unsupported", async () => {
    delete (window as unknown as Record<string, unknown>).PushManager;
    const { currentPushSubscription } = await import("@/lib/push");
    await expect(currentPushSubscription()).resolves.toBeNull();
  });

  it("sign-out finishes as soon as push is released", async () => {
    existing = fakeSubscription();
    await expect(releasePushOnSignOut()).resolves.toBeUndefined();
    expect(existing.unsubscribe).toHaveBeenCalled();
  });
});

describe("web push release", () => {
  it("turning off survives the browser refusing to unsubscribe", async () => {
    existing = fakeSubscription();
    existing.unsubscribe.mockRejectedValueOnce(new Error("refused"));
    await expect(disablePush()).resolves.toBeUndefined();
    expect(authedFetch).toHaveBeenCalled();
  });
});
