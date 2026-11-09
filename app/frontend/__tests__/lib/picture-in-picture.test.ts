import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ANDROID_PIP_ACTIVE,
  ANDROID_PIP_EVENT,
  ANDROID_PIP_TARGET,
  reportAndroidPictureInPicture,
  canDocumentPictureInPicture,
  canVideoPictureInPicture,
  openDocumentPictureInPicture,
  isInVideoPictureInPicture,
  toggleVideoPictureInPicture,
} from "@/lib/picture-in-picture";

function setDocument(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(document, k, { value: v, configurable: true });
  }
}

afterEach(() => {
  setDocument({ pictureInPictureEnabled: undefined, pictureInPictureElement: null });
  delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
  delete (window as unknown as Record<string, unknown>).ZcryptAndroid;
  document.documentElement.removeAttribute(ANDROID_PIP_ACTIVE);
  document.body.innerHTML = "";
});

function androidBridge() {
  const bridge = {
    supportsPictureInPicture: () => true,
    setPictureInPictureReady: vi.fn(),
    enterPictureInPicture: vi.fn(),
  };
  (window as unknown as Record<string, unknown>).ZcryptAndroid = bridge;
  return bridge;
}

function playingVideo() {
  const el = document.createElement("video");
  document.body.appendChild(el);
  Object.defineProperty(el, "paused", { value: false, configurable: true });
  Object.defineProperty(el, "videoWidth", { value: 1280 });
  Object.defineProperty(el, "videoHeight", { value: 720 });
  return el;
}

describe("Android app picture-in-picture", () => {
  it("is offered through the app's bridge where the WebView has no API", () => {
    androidBridge();
    expect(canVideoPictureInPicture(document.createElement("video"))).toBe(true);
  });

  it("reports the one playing video, with its shape, as the window to float", () => {
    const bridge = androidBridge();
    const a = playingVideo();
    const b = playingVideo();
    reportAndroidPictureInPicture(a, true);
    reportAndroidPictureInPicture(b, true);
    expect(a.hasAttribute(ANDROID_PIP_TARGET)).toBe(false);
    expect(b.hasAttribute(ANDROID_PIP_TARGET)).toBe(true);
    expect(bridge.setPictureInPictureReady).toHaveBeenLastCalledWith(true, 1280, 720);
  });

  it("turns floating off when the reported video stops, and ignores videos it never reported", () => {
    const bridge = androidBridge();
    const el = playingVideo();
    reportAndroidPictureInPicture(document.createElement("video"), false);
    expect(bridge.setPictureInPictureReady).not.toHaveBeenCalled();
    reportAndroidPictureInPicture(el, true);
    reportAndroidPictureInPicture(el, false);
    expect(el.hasAttribute(ANDROID_PIP_TARGET)).toBe(false);
    expect(bridge.setPictureInPictureReady).toHaveBeenLastCalledWith(false, 1280, 720);
  });

  it("the button floats the app now", async () => {
    const bridge = androidBridge();
    const el = playingVideo();
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(true);
    expect(bridge.enterPictureInPicture).toHaveBeenCalled();
    expect(el.hasAttribute(ANDROID_PIP_TARGET)).toBe(true);
  });

  it("hides the page while floating and shows it again after, even if the video closed meanwhile", () => {
    window.dispatchEvent(new CustomEvent(ANDROID_PIP_EVENT, { detail: true }));
    expect(document.documentElement.hasAttribute(ANDROID_PIP_ACTIVE)).toBe(true);
    window.dispatchEvent(new CustomEvent(ANDROID_PIP_EVENT, { detail: false }));
    expect(document.documentElement.hasAttribute(ANDROID_PIP_ACTIVE)).toBe(false);
  });

  it("does nothing outside the Android app", () => {
    const el = playingVideo();
    reportAndroidPictureInPicture(el, true);
    expect(el.hasAttribute(ANDROID_PIP_TARGET)).toBe(false);
  });
});

describe("video picture-in-picture", () => {
  it("is unavailable without an element or browser support", () => {
    expect(canVideoPictureInPicture(null)).toBe(false);
    expect(canVideoPictureInPicture(document.createElement("video"))).toBe(false);
  });

  it("uses the standard API when the browser enables it", async () => {
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: null });
    const el = document.createElement("video");
    const request = vi.fn(async () => ({}) as PictureInPictureWindow);
    el.requestPictureInPicture = request;
    expect(canVideoPictureInPicture(el)).toBe(true);
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(true);
    expect(request).toHaveBeenCalled();
  });

  it("closes the window when the element is already floating", async () => {
    const el = document.createElement("video");
    const exit = vi.fn(async () => {});
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: el, exitPictureInPicture: exit });
    el.requestPictureInPicture = vi.fn();
    expect(isInVideoPictureInPicture(el)).toBe(true);
    await toggleVideoPictureInPicture(el);
    expect(exit).toHaveBeenCalled();
    expect(el.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it("falls back to WebKit presentation mode (Safari, the Mac app)", async () => {
    const el = document.createElement("video") as HTMLVideoElement & Record<string, unknown>;
    el.webkitSupportsPresentationMode = (m: string) => m === "picture-in-picture";
    el.webkitPresentationMode = "inline";
    const set = vi.fn();
    el.webkitSetPresentationMode = set;
    expect(canVideoPictureInPicture(el)).toBe(true);
    await toggleVideoPictureInPicture(el);
    expect(set).toHaveBeenCalledWith("picture-in-picture");
  });

  it("reports a refusal instead of throwing", async () => {
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: null });
    const el = document.createElement("video");
    el.requestPictureInPicture = vi.fn(async () => {
      throw new DOMException("no gesture", "NotAllowedError");
    });
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(false);
  });
});

describe("document picture-in-picture", () => {
  it("is offered only where the browser has it", () => {
    expect(canDocumentPictureInPicture()).toBe(false);
    (window as unknown as Record<string, unknown>).documentPictureInPicture = { requestWindow: vi.fn() };
    expect(canDocumentPictureInPicture()).toBe(true);
  });
});

describe("picture-in-picture fallbacks", () => {
  it("WebKit toggles back to inline when already floating, and reports nothing to do elsewhere", async () => {
    const el = document.createElement("video") as HTMLVideoElement & Record<string, unknown>;
    el.webkitPresentationMode = "picture-in-picture";
    const set = vi.fn();
    el.webkitSetPresentationMode = set;
    expect(isInVideoPictureInPicture(el)).toBe(true);
    await toggleVideoPictureInPicture(el);
    expect(set).toHaveBeenCalledWith("inline");
    await expect(toggleVideoPictureInPicture(document.createElement("video"))).resolves.toBe(false);
    expect(isInVideoPictureInPicture(null)).toBe(false);
  });

  it("the Android button starts a paused video before floating", async () => {
    const bridge = androidBridge();
    const el = document.createElement("video");
    document.body.appendChild(el);
    Object.defineProperty(el, "paused", { value: true, configurable: true });
    const play = vi.spyOn(el, "play").mockResolvedValue(undefined);
    await toggleVideoPictureInPicture(el);
    expect(play).toHaveBeenCalled();
    expect(bridge.enterPictureInPicture).toHaveBeenCalled();
  });
});

describe("document picture-in-picture window", () => {
  function fakePipWindow() {
    const doc = document.implementation.createHTMLDocument("pip");
    return { document: doc } as unknown as Window;
  }

  it("copies the page's styles, theme class and data attributes into the window", async () => {
    const pip = fakePipWindow();
    const requestWindow = vi.fn(async () => pip);
    (window as unknown as Record<string, unknown>).documentPictureInPicture = { requestWindow };
    const style = document.createElement("style");
    style.textContent = ".x { color: red; }";
    document.head.appendChild(style);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.example/a.css";
    document.head.appendChild(link);
    Object.defineProperty(document, "styleSheets", {
      configurable: true,
      value: [
        style.sheet,
        { href: "https://cdn.example/a.css", get cssRules(): CSSRuleList { throw new DOMException("cross-origin", "SecurityError"); } },
        { href: null, get cssRules(): CSSRuleList { throw new DOMException("x", "SecurityError"); } },
      ],
    });
    document.documentElement.className = "dark";
    document.documentElement.setAttribute("data-theme", "ocean");

    const opened = await openDocumentPictureInPicture({ width: 360, height: 120 });

    expect(opened).toBe(pip);
    expect(requestWindow).toHaveBeenCalledWith({ width: 360, height: 120 });
    expect(pip.document.head.querySelector("style")?.textContent).toContain("color: red");
    expect(pip.document.head.querySelector("link")?.getAttribute("href")).toBe("https://cdn.example/a.css");
    expect(pip.document.documentElement.className).toBe("dark");
    expect(pip.document.documentElement.getAttribute("data-theme")).toBe("ocean");
    delete (document as unknown as Record<string, unknown>).styleSheets;
    style.remove();
    link.remove();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it("returns null where unsupported or when the browser refuses", async () => {
    await expect(openDocumentPictureInPicture({ width: 1, height: 1 })).resolves.toBeNull();
    (window as unknown as Record<string, unknown>).documentPictureInPicture = {
      requestWindow: vi.fn(async () => {
        throw new DOMException("no gesture", "NotAllowedError");
      }),
    };
    await expect(openDocumentPictureInPicture({ width: 1, height: 1 })).resolves.toBeNull();
  });
});

describe("Android bridge alongside the standard API", () => {
  it("reporting the same video twice keeps it as the target", () => {
    const bridge = androidBridge();
    const el = playingVideo();
    reportAndroidPictureInPicture(el, true);
    reportAndroidPictureInPicture(el, true);
    expect(el.hasAttribute(ANDROID_PIP_TARGET)).toBe(true);
    expect(bridge.setPictureInPictureReady).toHaveBeenCalledTimes(2);
  });

  it("prefers the standard API when the WebView has one", async () => {
    const bridge = androidBridge();
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: null });
    const el = playingVideo();
    el.requestPictureInPicture = vi.fn(async () => ({}) as PictureInPictureWindow);
    await toggleVideoPictureInPicture(el);
    expect(el.requestPictureInPicture).toHaveBeenCalled();
    expect(bridge.enterPictureInPicture).not.toHaveBeenCalled();
  });

  it("ignores a bridge that says the device can't float", () => {
    (window as unknown as Record<string, unknown>).ZcryptAndroid = { supportsPictureInPicture: () => false };
    expect(canVideoPictureInPicture(document.createElement("video"))).toBe(false);
  });
});

describe("Android floating when playback is refused", () => {
  it("still floats if the browser blocks play()", async () => {
    const bridge = androidBridge();
    const el = document.createElement("video");
    document.body.appendChild(el);
    Object.defineProperty(el, "paused", { value: true, configurable: true });
    vi.spyOn(el, "play").mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(true);
    expect(bridge.enterPictureInPicture).toHaveBeenCalled();
  });
});
