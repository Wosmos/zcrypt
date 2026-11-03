import { detectDevice } from "@/components/marketing/download/download-cta";
import { DESKTOP_DOWNLOAD_PATH } from "@/lib/web-transfer-limit";
import { toast, type ToastAction } from "@/store/toast";
import { tr } from "@/store/translate";

/** The link the desktop and Android apps register. It only brings the app forward and carries no data. */
export const DESKTOP_APP_URL = "zcrypt://open";

/** How long the page waits for the browser to hand over to the app before it assumes there is none. */
export const OPEN_DETECT_MS = 1500;

const MEMORY_KEY = "zcrypt.desktopApp";

/** Which button to lead with: open the app when it worked before or was never tried, else download it. */
export type DesktopAppLead = "open" | "download";

function readMemory(): string | null {
  try {
    return localStorage.getItem(MEMORY_KEY);
  } catch {
    return null;
  }
}

function writeMemory(value: "opened" | "missing"): void {
  try {
    localStorage.setItem(MEMORY_KEY, value);
  } catch {
    return;
  }
}

/** Whether there is an app to open from this device at all. iPhones and iPads have none. */
export function canOpenDesktopApp(): boolean {
  return detectDevice() !== "ios";
}

/** The button to lead with right now, from what happened the last time the app was opened. */
export function desktopAppLead(): DesktopAppLead {
  if (!canOpenDesktopApp()) return "download";
  return readMemory() === "missing" ? "download" : "open";
}

/** Open the desktop app download page in a new tab, so uploads still running here keep going. */
export function openDesktopDownload(): void {
  window.open(DESKTOP_DOWNLOAD_PATH, "_blank", "noopener");
}

function fireLink(isAndroid: boolean): HTMLElement | null {
  if (isAndroid) {
    const anchor = document.createElement("a");
    anchor.style.display = "none";
    anchor.href = DESKTOP_APP_URL;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return null;
  }
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = DESKTOP_APP_URL;
  document.body.appendChild(frame);
  return frame;
}

/**
 * Ask the browser to open the app and report whether it seemed to. A browser
 * never says whether a custom link found a handler, so success is inferred: the
 * page loses focus or goes hidden within `timeoutMs`, which is what happens when
 * the OS brings the app (or the browser's own "Open zcrypt?" prompt) forward.
 * A prompt the user then cancels still reads as success. The current tab is
 * never navigated: the link goes through a hidden iframe, or a hidden anchor on
 * Android where browsers ignore custom links in frames.
 */
export function attemptOpenDesktopApp(timeoutMs: number = OPEN_DETECT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let el: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (opened: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      el?.remove();
      resolve(opened);
    };
    const onLeave = () => settle(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") settle(true);
    };

    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    timer = setTimeout(() => settle(false), timeoutMs);
    try {
      el = fireLink(detectDevice() === "android");
    } catch {
      settle(false);
    }
  });
}

/**
 * The whole "open the app" flow: try the link, remember how it went so the next
 * prompt leads with the right button, and when nothing opened offer the download
 * in a new tab. Resolves to whether the app seemed to open.
 */
export async function launchDesktopApp(): Promise<boolean> {
  if (!canOpenDesktopApp()) {
    openDesktopDownload();
    return false;
  }
  const opened = await attemptOpenDesktopApp();
  writeMemory(opened ? "opened" : "missing");
  if (!opened) {
    toast.info(
      tr("toasts.desktopAppMissing"),
      { label: tr("toasts.downloadDesktopApp"), onClick: openDesktopDownload },
      { key: "desktop-app-missing" },
    );
  }
  return opened;
}

/** The toast or button action that gets the user into the desktop app, led by what worked before. */
export function desktopAppAction(): ToastAction {
  if (desktopAppLead() === "open") {
    return {
      label: tr("toasts.openDesktopApp"),
      onClick: () => {
        void launchDesktopApp();
      },
    };
  }
  return { label: tr("toasts.getDesktopApp"), onClick: openDesktopDownload };
}
