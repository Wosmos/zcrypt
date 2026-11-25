import { API_BASE } from "@/lib/config";
import { isTauri } from "@/lib/tauri";

/**
 * Every call to the zcrypt API names the app that made it ("web/0.2.3",
 * "desktop-windows/0.2.3", "android/0.2.3"). The server holds a session to the
 * kind of app that started it, so a sign-in copied into another program is
 * ended, and the admin console can tell the web from the apps.
 */
export const CLIENT_HEADER = "X-Zcrypt-Client";

export function clientPlatform(tauri = isTauri, userAgent = navigator.userAgent): string {
  if (!tauri) return "web";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows/i.test(userAgent)) return "desktop-windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "desktop-macos";
  return "desktop-linux";
}

export function clientMarker(version = process.env.NEXT_PUBLIC_APP_VERSION): string {
  const v = version && /^[0-9A-Za-z.+-]{1,24}$/.test(version) ? version : "0";
  return `${clientPlatform()}/${v}`;
}

/** Whether a request goes to the zcrypt API, directly or through the site. */
export function isApiRequest(url: string, apiBase = API_BASE): boolean {
  if (url.startsWith("/api/")) return true;
  if (apiBase && url.startsWith(`${apiBase}/api/`)) return true;
  try {
    const u = new URL(url);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

let installed = false;

/** Adds the client header to every API request made with fetch. */
export function installClientMarker(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiRequest(requestUrl(input))) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(CLIENT_HEADER)) headers.set(CLIENT_HEADER, clientMarker());
    return original(input, { ...init, headers });
  };
}

/** Test hook: lets a test install the wrapper again over a fresh fetch. */
export function resetClientMarkerForTest(): void {
  installed = false;
}
