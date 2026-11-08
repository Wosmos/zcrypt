/**
 * Picture-in-picture for decrypted media. Everything here runs in the browser:
 * the floating window is drawn by the OS from the same blob URL, nothing is
 * uploaded or re-fetched.
 *
 * Video uses the standard API (Chromium, Safari, Edge, the Windows WebView2
 * desktop app) with WebKit's presentation mode as the fallback (macOS
 * WKWebView, the Mac desktop app). Audio has no picture to float, so it gets a
 * Document Picture-in-Picture window holding the player controls where the
 * browser has one (Chromium desktop).
 */

type WebKitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

export function canVideoPictureInPicture(el: HTMLVideoElement | null): boolean {
  if (!el || typeof document === "undefined") return false;
  if (document.pictureInPictureEnabled && !el.disablePictureInPicture) return true;
  return (el as WebKitVideo).webkitSupportsPresentationMode?.("picture-in-picture") === true;
}

export function isInVideoPictureInPicture(el: HTMLVideoElement | null): boolean {
  if (!el || typeof document === "undefined") return false;
  return (
    document.pictureInPictureElement === el ||
    (el as WebKitVideo).webkitPresentationMode === "picture-in-picture"
  );
}

/** Opens or closes the floating window for `el`. Resolves false when the
 *  browser refused (no user gesture, policy, unsupported). */
export async function toggleVideoPictureInPicture(el: HTMLVideoElement): Promise<boolean> {
  const webkit = el as WebKitVideo;
  try {
    if (document.pictureInPictureEnabled && el.requestPictureInPicture) {
      if (document.pictureInPictureElement === el) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
      return true;
    }
    if (webkit.webkitSetPresentationMode) {
      webkit.webkitSetPresentationMode(
        webkit.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture",
      );
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

function documentPip(): DocumentPictureInPicture | null {
  if (typeof window === "undefined") return null;
  return (
    (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
      .documentPictureInPicture ?? null
  );
}

export function canDocumentPictureInPicture(): boolean {
  return documentPip() !== null;
}

/**
 * Opens a small always-on-top window and copies the page's styles into it, so
 * React content portaled there renders with the app's theme. Returns null when
 * unsupported or refused.
 */
export async function openDocumentPictureInPicture(size: {
  width: number;
  height: number;
}): Promise<Window | null> {
  const api = documentPip();
  if (!api) return null;
  try {
    const pip = await api.requestWindow(size);
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const css = Array.from(sheet.cssRules, (r) => r.cssText).join("\n");
        const style = pip.document.createElement("style");
        style.textContent = css;
        pip.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = pip.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          pip.document.head.appendChild(link);
        }
      }
    }
    pip.document.documentElement.className = document.documentElement.className;
    for (const attr of Array.from(document.documentElement.attributes)) {
      if (attr.name.startsWith("data-"))
        pip.document.documentElement.setAttribute(attr.name, attr.value);
    }
    return pip;
  } catch {
    return null;
  }
}
