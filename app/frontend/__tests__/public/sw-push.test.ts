import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Listener = (event: Record<string, unknown>) => void;
const listeners: Record<string, Listener> = {};
const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
const opened: string[] = [];
let windows: Array<{ visibilityState: string; url: string }> = [];

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
      matchAll: async () => windows,
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
    expect(last?.options.tag).toBe("zcrypt-sign-in");
  });

  it("shows nothing while a visible window exists, because that window got a toast", async () => {
    const before = shown.length;
    windows = [{ visibilityState: "visible", url: "https://example.com/dashboard" }];
    await push({ type: "memberLeft", lang: "en", data: { space_id: "s1", username: "Wasif" }, url: "/spaces" });
    expect(shown.length).toBe(before);
    windows = [{ visibilityState: "hidden", url: "https://example.com/dashboard" }];
    await push({ type: "memberLeft", lang: "en", data: { space_id: "s1", username: "Wasif" }, url: "/spaces" });
    expect(shown.length).toBe(before + 1);
    windows = [];
  });

  it("words each Space event and tags it like the live event so they replace each other", async () => {
    await push({ type: "memberLeft", lang: "de", data: { space_id: "s1", user_id: "u9", username: "Wasif" }, url: "/spaces" });
    expect(shown.at(-1)?.title).toBe("Wasif hat einen deiner Spaces verlassen");
    expect(shown.at(-1)?.options.tag).toBe("zcrypt-memberLeft-s1-u9");
    expect(shown.at(-1)?.options.renotify).toBe(false);
    await push({ type: "invitePending", lang: "en", data: { username: "Wasif" }, url: "/spaces" });
    expect(shown.at(-1)?.title).toBe("Wasif invited you to a Space");
    expect(shown.at(-1)?.options.body).toBe("Unlock your vault to join.");
  });

  it("names who added you when the invite carries a username, and keeps the plain copy without one", async () => {
    await push({ type: "inviteReceived", lang: "en", data: { space_id: "s1", username: "Wasif" }, url: "/spaces" });
    expect(shown.at(-1)?.title).toBe("Wasif added you to a Space");
    expect(shown.at(-1)?.options.body).toBe("Open zcrypt to see what was shared with you.");
    await push({ type: "inviteReceived", lang: "de", data: { space_id: "s1", username: "Wasif" }, url: "/spaces" });
    expect(shown.at(-1)?.title).toBe("Wasif hat dich zu einem Space hinzugefügt");
    await push({ type: "inviteReceived", lang: "en", data: { space_id: "s1" }, url: "/spaces" });
    expect(shown.at(-1)?.title).toBe("You were added to a Space");
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
    for (const url of ["//evil.example/x", "/\\evil.example"]) {
      await push({ type: "inviteReceived", lang: "en", url });
      expect((shown.at(-1)?.options.data as { url: string }).url).toBe("/dashboard");
    }

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
