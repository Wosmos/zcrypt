import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(windows: Array<{ url: string; focus: () => Promise<void>; postMessage: (m: unknown) => void }>) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: "https://zcrypt.app" },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
  };
  const code = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
  new Function("self", code)(self);
  return { self, handlers };
}

async function click(handlers: Record<string, Handler>, action: string, data: unknown) {
  let work: Promise<unknown> = Promise.resolve();
  const close = vi.fn();
  handlers.notificationclick({
    action,
    notification: { data, close },
    waitUntil: (p: Promise<unknown>) => {
      work = p;
    },
  });
  await work;
  return close;
}

describe("public/sw.js", () => {
  it("takes over at once and never handles fetches", async () => {
    const { self, handlers } = loadWorker([]);
    expect(handlers.fetch).toBeUndefined();
    handlers.install({});
    expect(self.skipWaiting).toHaveBeenCalled();
    let claimed: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => (claimed = p) });
    await claimed;
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it("focuses an open zcrypt window and relays the tapped action", async () => {
    const other = { url: "https://elsewhere.app/", focus: vi.fn(async () => {}), postMessage: vi.fn() };
    const app = { url: "https://zcrypt.app/dashboard", focus: vi.fn(async () => {}), postMessage: vi.fn() };
    const { self, handlers } = loadWorker([other, app]);
    const close = await click(handlers, "", { url: "/dashboard?open=f1", folderId: "f1", click: "view" });
    expect(close).toHaveBeenCalled();
    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledWith({ type: "zcrypt:notification", action: "view", folderId: "f1" });
    await click(handlers, "retry", { folderId: 3 });
    expect(app.postMessage).toHaveBeenLastCalledWith({ type: "zcrypt:notification", action: "retry", folderId: null });
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the folder link when no window is open, and the dashboard otherwise", async () => {
    const { self, handlers } = loadWorker([]);
    await click(handlers, "view", { url: "/dashboard?open=f1" });
    expect(self.clients.openWindow).toHaveBeenLastCalledWith("/dashboard?open=f1");
    await click(handlers, "retry", null);
    expect(self.clients.openWindow).toHaveBeenLastCalledWith("/dashboard");
    await click(handlers, "", {});
    expect(self.clients.openWindow).toHaveBeenLastCalledWith("/dashboard");
  });
});
