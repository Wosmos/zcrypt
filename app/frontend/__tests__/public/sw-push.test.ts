import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Listener = (event: Record<string, unknown>) => void;
const listeners: Record<string, Listener> = {};
const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
const opened: string[] = [];

beforeAll(() => {
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {},
    location: { origin: "https://example.com" },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  new Function("self", readFileSync(join(__dirname, "../../public/sw.js"), "utf8"))(self);
});

async function push(payload: unknown) {
  let pending: Promise<unknown> = Promise.resolve();
  listeners.push({
    data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
}

describe("service worker push", () => {
  it("shows a sign-in alert in the subscriber's language with the device filled in", async () => {
    await push({ type: "newSignIn", lang: "de", data: { device: "Chrome on Mac" }, url: "/settings?tab=sessions" });
    const last = shown.at(-1);
    expect(last?.title).toBe("Neue Anmeldung bei deinem zcrypt-Konto");
    expect(last?.options.body).toContain("Chrome on Mac");
    expect(last?.options.tag).toBe("zcrypt-push-newSignIn");
  });

  it("falls back to English and ignores unknown events or junk", async () => {
    await push({ type: "linkViewed", lang: "xx", url: "/tools" });
    expect(shown.at(-1)?.title).toBe("Someone opened your share link");
    const before = shown.length;
    await push({ type: "somethingElse", lang: "en" });
    await push("not json");
    expect(shown.length).toBe(before);
  });

  it("only links inside the app, and a click opens that page", async () => {
    await push({ type: "inviteReceived", lang: "en", url: "https://evil.example/" });
    const data = shown.at(-1)?.options.data as { url: string };
    expect(data.url).toBe("/dashboard");

    const close = vi.fn();
    let pending: Promise<unknown> = Promise.resolve();
    listeners.notificationclick({
      notification: { data: { url: "/spaces", click: "go" }, close },
      action: "",
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(close).toHaveBeenCalled();
    expect(opened.at(-1)).toBe("/spaces");
  });
});
