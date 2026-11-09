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
