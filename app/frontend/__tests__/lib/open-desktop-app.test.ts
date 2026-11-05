import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  device: null as string | null,
  toastInfo: vi.fn(),
}));

vi.mock("@/components/marketing/download/download-cta", () => ({ detectDevice: () => h.device }));
vi.mock("@/store/toast", () => ({ toast: { info: h.toastInfo } }));

import {
  DESKTOP_APP_URL,
  OPEN_DETECT_MS,
  attemptOpenDesktopApp,
  canOpenDesktopApp,
  desktopAppAction,
  desktopAppLead,
  launchDesktopApp,
  openDesktopDownload,
} from "@/lib/open-desktop-app";

const KEY = "zcrypt.desktopApp";

function stubStorage(impl: Partial<Storage> | "throws") {
  const store = new Map<string, string>();
  const base: Partial<Storage> = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
  const throwing = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal(
    "localStorage",
    impl === "throws" ? { getItem: throwing, setItem: throwing } : { ...base, ...impl },
  );
  return store;
}

let visibility: DocumentVisibilityState;

beforeEach(() => {
  vi.useFakeTimers();
  h.device = "windows";
  h.toastInfo.mockReset();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  stubStorage({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("attemptOpenDesktopApp", () => {
  it("fires the link through a hidden iframe and reports failure when nothing leaves the page", async () => {
    const result = attemptOpenDesktopApp();
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(DESKTOP_APP_URL);
    expect(frame?.style.display).toBe("none");
    await vi.advanceTimersByTimeAsync(OPEN_DETECT_MS);
    await expect(result).resolves.toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("reports success when the window loses focus", async () => {
    const result = attemptOpenDesktopApp();
    window.dispatchEvent(new Event("blur"));
    await expect(result).resolves.toBe(true);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("reports success when the page is hidden", async () => {
    const result = attemptOpenDesktopApp();
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await expect(result).resolves.toBe(true);
  });

  it("reports success when the page is put away", async () => {
    const result = attemptOpenDesktopApp();
    window.dispatchEvent(new Event("pagehide"));
    await expect(result).resolves.toBe(true);
  });

  it("ignores a visibility change that leaves the page visible", async () => {
    const result = attemptOpenDesktopApp(500);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe(false);
  });

  it("settles once and stops listening afterwards", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const result = attemptOpenDesktopApp();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("blur"));
    await expect(result).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function));
    remove.mockRestore();
  });

  it("uses a hidden anchor on Android, where frames cannot open custom links", async () => {
    h.device = "android";
    let href: string | null = null;
    let rel = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      const anchor = document.querySelector("a");
      href = anchor?.getAttribute("href") ?? null;
      rel = anchor?.rel ?? "";
    });
    const result = attemptOpenDesktopApp(300);
    expect(href).toBe(DESKTOP_APP_URL);
    expect(rel).toBe("noopener");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("iframe")).toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toBe(false);
    expect(document.querySelector("a")).toBeNull();
    click.mockRestore();
  });

  it("settles when the browser leaves the page during the click itself", async () => {
    h.device = "android";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await expect(attemptOpenDesktopApp()).resolves.toBe(true);
    click.mockRestore();
  });

  it("reports failure when the link cannot be fired at all", async () => {
    const append = vi.spyOn(document.body, "appendChild").mockImplementation(() => {
      throw new Error("no body");
    });
    await expect(attemptOpenDesktopApp()).resolves.toBe(false);
    append.mockRestore();
  });
});

describe("desktopAppLead", () => {
  it("leads with opening the app until an attempt fails", () => {
    expect(desktopAppLead()).toBe("open");
    localStorage.setItem(KEY, "opened");
    expect(desktopAppLead()).toBe("open");
    localStorage.setItem(KEY, "missing");
    expect(desktopAppLead()).toBe("download");
  });

  it("leads with the download on iPhone and iPad, which have no app to open", () => {
    h.device = "ios";
    expect(canOpenDesktopApp()).toBe(false);
    expect(desktopAppLead()).toBe("download");
  });

  it("still works when storage is blocked", () => {
    stubStorage("throws");
    expect(desktopAppLead()).toBe("open");
  });
});

describe("launchDesktopApp", () => {
  it("remembers a successful open and shows nothing else", async () => {
    const result = launchDesktopApp();
    window.dispatchEvent(new Event("blur"));
    await expect(result).resolves.toBe(true);
    expect(localStorage.getItem(KEY)).toBe("opened");
    expect(h.toastInfo).not.toHaveBeenCalled();
  });

  it("goes to the download page in a new tab when nothing opened, with no toast", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const result = launchDesktopApp();
    await vi.advanceTimersByTimeAsync(OPEN_DETECT_MS);
    await expect(result).resolves.toBe(false);
    expect(open).toHaveBeenCalledWith("/download", "_blank", "noopener");
    expect(h.toastInfo).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("offers the download in a toast when the new tab was blocked, and labels with it next time", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const result = launchDesktopApp();
    await vi.advanceTimersByTimeAsync(OPEN_DETECT_MS);
    await expect(result).resolves.toBe(false);
    expect(localStorage.getItem(KEY)).toBe("missing");
    expect(desktopAppLead()).toBe("download");
    expect(h.toastInfo).toHaveBeenCalledWith(
      "Couldn't open the desktop app. Don't have it yet?",
      { label: "Download the desktop app", onClick: openDesktopDownload },
      { key: "desktop-app-missing" },
    );
    h.toastInfo.mock.calls[0][1].onClick();
    expect(open).toHaveBeenLastCalledWith("/download", "_blank", "noopener");
    open.mockRestore();
  });

  it("goes straight to the download on iOS without trying the link", async () => {
    h.device = "ios";
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(launchDesktopApp()).resolves.toBe(false);
    expect(open).toHaveBeenCalledWith("/download", "_blank", "noopener");
    expect(document.querySelector("iframe")).toBeNull();
    open.mockRestore();
  });

  it("copes with blocked storage", async () => {
    stubStorage("throws");
    const result = launchDesktopApp();
    window.dispatchEvent(new Event("blur"));
    await expect(result).resolves.toBe(true);
  });
});

describe("desktopAppAction", () => {
  it("leads with Open and runs the flow", async () => {
    const action = desktopAppAction();
    expect(action.label).toBe("Open the desktop app");
    action.onClick();
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(KEY)).toBe("opened");
  });

  it("says Get after a failed attempt but still tries the app first", async () => {
    localStorage.setItem(KEY, "missing");
    const action = desktopAppAction();
    expect(action.label).toBe("Get the desktop app");
    action.onClick();
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(KEY)).toBe("opened");
  });
});
