import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return env.isTauri;
  },
}));

type SW = typeof import("@/lib/service-worker");
let S: SW;

function installContainer(register = vi.fn(async () => ({}))) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register,
      addEventListener: vi.fn((_type: string, fn: (e: MessageEvent) => void) => listeners.push(fn)),
    },
  });
  return { register, listeners };
}

function setLocation(protocol: string, hostname: string) {
  vi.stubGlobal("location", { protocol, hostname });
}

beforeEach(async () => {
  vi.resetModules();
  env.isTauri = false;
  S = await import("@/lib/service-worker");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("canRegisterServiceWorker", () => {
  it("refuses outside a browser, inside Tauri and without service worker support", () => {
    vi.stubGlobal("window", undefined);
    expect(S.canRegisterServiceWorker()).toBe(false);
    vi.unstubAllGlobals();
    expect(S.canRegisterServiceWorker()).toBe(false);
    installContainer();
    env.isTauri = true;
    expect(S.canRegisterServiceWorker()).toBe(false);
  });

  it("allows HTTPS and localhost only", () => {
    installContainer();
    setLocation("https:", "zcrypt.app");
    expect(S.canRegisterServiceWorker()).toBe(true);
    setLocation("http:", "localhost");
    expect(S.canRegisterServiceWorker()).toBe(true);
    setLocation("http:", "192.168.1.4");
    expect(S.canRegisterServiceWorker()).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js once and relays notification taps", async () => {
    const { register, listeners } = installContainer();
    setLocation("https:", "zcrypt.app");
    await S.registerServiceWorker();
    await S.registerServiceWorker();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });

    const retry = vi.fn();
    window.addEventListener(S.RETRY_TRANSFERS_EVENT, retry);
    listeners[0]({ data: { type: "zcrypt:notification", action: "retry" } } as MessageEvent);
    expect(retry).toHaveBeenCalledTimes(1);
    window.removeEventListener(S.RETRY_TRANSFERS_EVENT, retry);
  });

  it("does nothing where it cannot register, and tries again after a failure", async () => {
    await S.registerServiceWorker();
    const register = vi.fn().mockRejectedValueOnce(new Error("blocked")).mockResolvedValue({});
    installContainer(register);
    setLocation("https:", "zcrypt.app");
    await S.registerServiceWorker();
    await S.registerServiceWorker();
    expect(register).toHaveBeenCalledTimes(2);
  });
});

describe("handleWorkerMessage", () => {
  it("ignores anything that is not a zcrypt notification tap", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    S.handleWorkerMessage(null);
    S.handleWorkerMessage("text");
    S.handleWorkerMessage({ type: "other", action: "retry" });
    S.handleWorkerMessage({ type: "zcrypt:notification", action: "open" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("asks the explorer to open the folder, or the vault root when there is none", () => {
    const seen: Array<string | null> = [];
    const onOpen = (e: Event) => seen.push((e as CustomEvent<{ folderId: string | null }>).detail.folderId);
    window.addEventListener(S.OPEN_FOLDER_EVENT, onOpen);
    S.handleWorkerMessage({ type: "zcrypt:notification", action: "view", folderId: "f1" });
    S.handleWorkerMessage({ type: "zcrypt:notification", action: "view", folderId: 7 });
    window.removeEventListener(S.OPEN_FOLDER_EVENT, onOpen);
    expect(seen).toEqual(["f1", null]);
  });
});
