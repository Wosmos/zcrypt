import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  isTauri: false,
  background: true,
  invoke: vi.fn(),
}));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return env.isTauri;
  },
  tauriInvoke: env.invoke,
}));
vi.mock("@/lib/sounds", () => ({ isInBackground: () => env.background }));

type NotifyModule = typeof import("@/lib/notify");
type Prefs = typeof import("@/store/preferences");

let N: NotifyModule;
let P: Prefs;

const UA = navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ua });
}

interface FakeRegistration {
  showNotification: ReturnType<typeof vi.fn>;
}

function installWorker(registration: FakeRegistration | undefined, permission: NotificationPermission) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration) },
  });
  const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
  vi.stubGlobal("Notification", { permission, requestPermission });
  return { requestPermission };
}

function fakeRegistration(): FakeRegistration {
  return { showNotification: vi.fn(async () => {}) };
}

beforeEach(async () => {
  vi.resetModules();
  env.isTauri = false;
  env.background = true;
  env.invoke.mockReset();
  N = await import("@/lib/notify");
  P = await import("@/store/preferences");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  delete (navigator as { standalone?: boolean }).standalone;
  setUA(UA);
});

describe("notifyChannel", () => {
  it("is none outside a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(N.notifyChannel()).toBe("none");
  });

  it("is tauri on the desktop shell and tauri-mobile on Android", () => {
    env.isTauri = true;
    setUA("Mozilla/5.0 (Macintosh)");
    expect(N.notifyChannel()).toBe("tauri");
    setUA("Mozilla/5.0 (Linux; Android 14)");
    expect(N.notifyChannel()).toBe("tauri-mobile");
  });

  it("is sw where service workers and notifications exist, none otherwise", () => {
    expect(N.notifyChannel()).toBe("none");
    installWorker(undefined, "default");
    expect(N.notifyChannel()).toBe("sw");
  });
});

describe("describeNotification", () => {
  it("writes upload and download progress with the thumbnail only when allowed", () => {
    const up = N.describeNotification(
      { type: "transferProgress", kind: "upload", done: 37, total: 104, percent: 35, thumbnail: "data:x" },
      true,
    );
    expect(up).toMatchObject({
      title: "Uploading 37/104 · 35%",
      tag: "zcrypt-upload",
      progress: true,
      silent: true,
      image: "data:x",
    });
    const down = N.describeNotification(
      { type: "transferProgress", kind: "download", done: 1, total: 2, percent: 50, thumbnail: "data:x" },
      false,
    );
    expect(down.title).toBe("Downloading 1/2 · 50%");
    expect(down).not.toHaveProperty("image");
    const bare = N.describeNotification(
      { type: "transferProgress", kind: "upload", done: 1, total: 2, percent: 50 },
      true,
    );
    expect(bare).not.toHaveProperty("image");
  });

  it("summarises finished batches, links to the folder and offers Retry after failures", () => {
    const saved = N.describeNotification(
      { type: "transferDone", kind: "upload", count: 104, failed: 0, folder: "Family", folderId: "f/1", thumbnail: "data:x" },
      true,
    );
    expect(saved).toMatchObject({
      title: "Upload finished",
      body: "104 saved to Family.",
      url: "/dashboard?open=f%2F1",
      folderId: "f/1",
      click: "view",
      actions: ["view"],
      image: "data:x",
    });
    const some = N.describeNotification(
      { type: "transferDone", kind: "upload", count: 3, failed: 1, folder: "Family" },
      true,
    );
    expect(some).toMatchObject({ body: "3 saved to Family. 1 couldn't be sent.", url: "/dashboard", folderId: null, actions: ["view", "retry"] });
    const none = N.describeNotification(
      { type: "transferDone", kind: "upload", count: 0, failed: 4, folder: "Family" },
      true,
    );
    expect(none.body).toBe("4 couldn't be sent.");
    const zip = N.describeNotification(
      { type: "transferDone", kind: "download", count: 5, failed: 0, folder: "" },
      true,
    );
    expect(zip).toMatchObject({ title: "Download finished", body: "5 downloaded." });
    const zipSome = N.describeNotification(
      { type: "transferDone", kind: "download", count: 5, failed: 2, folder: "" },
      true,
    );
    expect(zipSome.body).toBe("5 downloaded. 2 couldn't be downloaded.");
  });

  it("names failures and routes alerts to their areas", () => {
    expect(
      N.describeNotification({ type: "transferFailed", kind: "upload", name: "a.jpg", reason: "r" }, true),
    ).toMatchObject({ title: "Couldn't upload a.jpg", body: "r", area: "problems", actions: ["retry"] });
    expect(
      N.describeNotification({ type: "transferFailed", kind: "download", name: "b.pdf", reason: "r" }, true)
        .title,
    ).toBe("Couldn't download b.pdf");
    expect(N.describeNotification({ type: "downloadDone", name: "b.pdf" }, true)).toMatchObject({
      title: "Download finished",
      body: "b.pdf",
      area: "transfers",
    });
    expect(N.describeNotification({ type: "newSignIn", device: "Chrome · Windows" }, true)).toMatchObject({
      title: "New sign-in to your account",
      body: "Chrome · Windows. Not you? Sign it out in Settings.",
      area: "security",
      url: "/settings?tab=security",
    });
    expect(N.describeNotification({ type: "inviteReceived", space: "Trips" }, true)).toMatchObject({
      title: "You were invited to Trips",
      area: "sharing",
      url: "/spaces",
    });
    expect(N.describeNotification({ type: "linkViewed", name: "Lease.pdf" }, true)).toMatchObject({
      title: "Someone opened your link",
      body: "Lease.pdf",
      area: "sharing",
    });
    expect(N.describeNotification({ type: "storageFull" }, true)).toMatchObject({
      title: "Your storage is full",
      area: "transfers",
      url: "/settings?tab=storage",
    });
  });
});

describe("shouldNotify", () => {
  const areas = { transfers: true, sharing: false, security: true, problems: true };

  it("needs a channel, the background and the area switch", () => {
    expect(N.shouldNotify({ area: "transfers", progress: false }, "none", true, areas)).toBe(false);
    expect(N.shouldNotify({ area: "transfers", progress: false }, "sw", false, areas)).toBe(false);
    expect(N.shouldNotify({ area: "sharing", progress: false }, "sw", true, areas)).toBe(false);
    expect(N.shouldNotify({ area: "transfers", progress: true }, "sw", true, areas)).toBe(true);
  });

  it("keeps progress off Android, where only done, failed and alerts are shown", () => {
    expect(N.shouldNotify({ area: "transfers", progress: true }, "tauri-mobile", true, areas)).toBe(false);
    expect(N.shouldNotify({ area: "transfers", progress: false }, "tauri-mobile", true, areas)).toBe(true);
  });
});

describe("failureReason", () => {
  it("turns a raw error into the plain cause", () => {
    expect(N.failureReason("upload", "Failed to fetch", 40)).toBe(
      "Couldn't send · the connection dropped at 40%",
    );
  });
});

describe("permissions", () => {
  it("is unsupported without a channel, for both reading and asking", async () => {
    await expect(N.notifyPermission()).resolves.toBe("unsupported");
    await expect(N.requestNotifyPermission()).resolves.toBe("unsupported");
  });

  it("reads and asks the browser, only prompting while undecided", async () => {
    const { requestPermission } = installWorker(undefined, "default");
    await expect(N.notifyPermission()).resolves.toBe("default");
    await expect(N.requestNotifyPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);

    const denied = installWorker(undefined, "denied");
    await expect(N.requestNotifyPermission()).resolves.toBe("denied");
    expect(denied.requestPermission).not.toHaveBeenCalled();
  });

  it("asks the Tauri plugin and remembers a grant", async () => {
    env.isTauri = true;
    env.invoke.mockResolvedValueOnce(true);
    await expect(N.notifyPermission()).resolves.toBe("granted");
    await expect(N.notifyPermission()).resolves.toBe("granted");
    expect(env.invoke).toHaveBeenCalledTimes(1);
    expect(env.invoke).toHaveBeenCalledWith("plugin:notification|is_permission_granted");
  });

  it("maps the plugin's undecided and refused answers", async () => {
    env.isTauri = true;
    env.invoke.mockResolvedValueOnce(false).mockResolvedValueOnce(null);
    await expect(N.notifyPermission()).resolves.toBe("denied");
    await expect(N.notifyPermission()).resolves.toBe("default");
    env.invoke.mockRejectedValueOnce(new Error("no plugin"));
    await expect(N.notifyPermission()).resolves.toBe("unsupported");
  });

  it("requests through the plugin", async () => {
    env.isTauri = true;
    env.invoke
      .mockResolvedValueOnce("denied")
      .mockResolvedValueOnce("prompt")
      .mockResolvedValueOnce("granted");
    await expect(N.requestNotifyPermission()).resolves.toBe("denied");
    await expect(N.requestNotifyPermission()).resolves.toBe("default");
    await expect(N.requestNotifyPermission()).resolves.toBe("granted");
    expect(env.invoke).toHaveBeenCalledWith("plugin:notification|request_permission");
    await expect(N.notifyPermission()).resolves.toBe("granted");
    env.invoke.mockRejectedValueOnce(new Error("no plugin"));
    await expect(N.requestNotifyPermission()).resolves.toBe("unsupported");
  });
});

describe("notify through the service worker", () => {
  const done = {
    type: "transferDone",
    kind: "upload",
    count: 2,
    failed: 1,
    folder: "Family",
    folderId: "f1",
    thumbnail: "data:x",
  } as const;

  it("shows a tagged notification with the thumbnail, actions and click data", async () => {
    const reg = fakeRegistration();
    installWorker(reg, "granted");
    await expect(N.notify(done)).resolves.toBe(true);
    const [title, options] = reg.showNotification.mock.calls[0];
    expect(title).toBe("Upload finished");
    expect(options).toMatchObject({
      body: "2 saved to Family. 1 couldn't be sent.",
      tag: "zcrypt-upload",
      icon: "/brand/icon-192.png",
      image: "data:x",
      renotify: true,
      silent: false,
      data: { url: "/dashboard?open=f1", folderId: "f1", click: "view" },
      actions: [
        { action: "view", title: "View" },
        { action: "retry", title: "Retry" },
      ],
    });
  });

  it("replaces progress quietly and drops the thumbnail when previews are off", async () => {
    const reg = fakeRegistration();
    installWorker(reg, "granted");
    P.usePreferencesStore.getState().setNotify({ thumbnails: false });
    await N.notify({ type: "transferProgress", kind: "upload", done: 1, total: 3, percent: 30, thumbnail: "data:x" });
    await N.notify({ type: "downloadDone", name: "a.bin" });
    const [, progress] = reg.showNotification.mock.calls[0];
    expect(progress).toMatchObject({ tag: "zcrypt-upload", renotify: false, silent: true, actions: [] });
    expect(progress).not.toHaveProperty("image");
    expect(reg.showNotification.mock.calls[1][1].data).toEqual({
      url: "/dashboard",
      folderId: null,
      click: null,
    });
  });

  it("stays silent in the foreground, for switched-off areas, without permission or a worker", async () => {
    const reg = fakeRegistration();
    installWorker(reg, "granted");
    env.background = false;
    await expect(N.notify(done)).resolves.toBe(false);
    env.background = true;
    P.usePreferencesStore.getState().setSoundArea("transfers", false);
    await expect(N.notify(done)).resolves.toBe(false);
    P.usePreferencesStore.getState().setSoundArea("transfers", true);
    installWorker(reg, "denied");
    await expect(N.notify(done)).resolves.toBe(false);
    installWorker(undefined, "granted");
    await expect(N.notify(done)).resolves.toBe(false);
    expect(reg.showNotification).not.toHaveBeenCalled();
  });

  it("never throws when the worker refuses", async () => {
    const reg = fakeRegistration();
    reg.showNotification.mockRejectedValue(new Error("no"));
    installWorker(reg, "granted");
    await expect(N.notify(done)).resolves.toBe(false);
  });
});

describe("notify through the Tauri shell", () => {
  beforeEach(() => {
    env.isTauri = true;
    setUA("Mozilla/5.0 (Macintosh)");
  });

  const progress = { type: "transferProgress", kind: "upload", done: 1, total: 4, percent: 25 } as const;

  it("uses one id per transfer kind and spaces progress out", async () => {
    vi.useFakeTimers();
    env.invoke.mockResolvedValue(true);
    await expect(N.notify(progress)).resolves.toBe(true);
    await expect(N.notify(progress)).resolves.toBe(false);
    vi.advanceTimersByTime(N.TAURI_PROGRESS_GAP_MS);
    await expect(N.notify(progress)).resolves.toBe(true);
    const shown = env.invoke.mock.calls.filter(([cmd]) => cmd === "plugin:notification|notify");
    expect(shown).toHaveLength(2);
    expect(shown[0][1]).toEqual({
      options: { id: 7101, title: "Uploading 1/4 · 25%", body: "Still going in the background", silent: true },
    });
  });

  it("lets the next batch's progress through right after a summary", async () => {
    env.invoke.mockResolvedValue(true);
    await N.notify(progress);
    await N.notify({ type: "newSignIn", device: "Phone" });
    await expect(N.notify(progress)).resolves.toBe(false);
    await N.notify({ type: "transferDone", kind: "download", count: 1, failed: 0, folder: "" });
    await expect(N.notify(progress)).resolves.toBe(true);
    const ids = env.invoke.mock.calls
      .filter(([cmd]) => cmd === "plugin:notification|notify")
      .map(([, args]) => (args as { options: { id: number } }).options.id);
    expect(ids).toEqual([7101, 7103, 7102, 7101]);
  });

  it("shows nothing without permission", async () => {
    env.invoke.mockResolvedValue(false);
    await expect(N.notify({ type: "storageFull" })).resolves.toBe(false);
  });

  it("skips progress on Android but still shows alerts", async () => {
    setUA("Mozilla/5.0 (Linux; Android 14)");
    env.invoke.mockResolvedValue(true);
    await expect(N.notify(progress)).resolves.toBe(false);
    await expect(N.notify({ type: "storageFull" })).resolves.toBe(true);
  });
});

describe("sendTestNotification", () => {
  it("does nothing without a channel", async () => {
    await expect(N.sendTestNotification("t", "b")).resolves.toBe(false);
  });

  it("shows right away, even in the foreground", async () => {
    const reg = fakeRegistration();
    installWorker(reg, "granted");
    env.background = false;
    await expect(N.sendTestNotification("Hi", "There")).resolves.toBe(true);
    expect(reg.showNotification).toHaveBeenCalledWith("Hi", expect.objectContaining({ tag: "zcrypt-test", body: "There" }));
  });

  it("reports false when the platform refuses", async () => {
    env.isTauri = true;
    env.invoke.mockRejectedValue(new Error("nope"));
    await expect(N.sendTestNotification("Hi", "There")).resolves.toBe(false);
  });
});

describe("needsHomeScreenInstall", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1";

  function matchMedia(standalone: boolean) {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: standalone })));
  }

  it("is false outside a browser and inside the app", () => {
    env.isTauri = true;
    setUA(IPHONE);
    expect(N.needsHomeScreenInstall()).toBe(false);
    env.isTauri = false;
    vi.stubGlobal("window", undefined);
    expect(N.needsHomeScreenInstall()).toBe(false);
  });

  it("is false on everything that is not an iPhone or iPad", () => {
    setUA("Mozilla/5.0 (Linux; Android 14) Chrome/120");
    expect(N.needsHomeScreenInstall()).toBe(false);
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(N.needsHomeScreenInstall()).toBe(false);
  });

  it("is true in iPhone Safari and on an iPad that reports a Mac", () => {
    setUA(IPHONE);
    matchMedia(false);
    expect(N.needsHomeScreenInstall()).toBe(true);
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 5 });
    expect(N.needsHomeScreenInstall()).toBe(true);
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 0 });
  });

  it("is false once installed to the Home Screen", () => {
    setUA(IPHONE);
    matchMedia(true);
    expect(N.needsHomeScreenInstall()).toBe(false);
    matchMedia(false);
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    expect(N.needsHomeScreenInstall()).toBe(false);
  });

  it("treats a browser without matchMedia as not installed", () => {
    setUA(IPHONE);
    vi.stubGlobal("matchMedia", undefined);
    expect(N.needsHomeScreenInstall()).toBe(true);
  });
});
