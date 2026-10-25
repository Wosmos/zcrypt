import { isTauri } from "@/lib/tauri";

/** Window event asking the explorer to open a folder by id (detail: { folderId }). */
export const OPEN_FOLDER_EVENT = "zcrypt:open-folder";
/** Window event asking the transfer panel to retry everything that failed. */
export const RETRY_TRANSFERS_EVENT = "zcrypt:retry-transfers";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True where a service worker may run: a secure page in a browser, never inside the Tauri shell. */
export function canRegisterServiceWorker(): boolean {
  if (typeof window === "undefined" || isTauri) return false;
  if (!("serviceWorker" in navigator)) return false;
  return location.protocol === "https:" || LOCAL_HOSTS.has(location.hostname);
}

/** Turn a notification click relayed by the service worker into an app event. */
export function handleWorkerMessage(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const msg = data as { type?: unknown; action?: unknown; folderId?: unknown };
  if (msg.type !== "zcrypt:notification") return;
  if (msg.action === "retry") {
    window.dispatchEvent(new Event(RETRY_TRANSFERS_EVENT));
    return;
  }
  if (msg.action === "view") {
    const folderId = typeof msg.folderId === "string" ? msg.folderId : null;
    window.dispatchEvent(new CustomEvent(OPEN_FOLDER_EVENT, { detail: { folderId } }));
  }
}

let registered = false;

/**
 * Register /sw.js once and relay its notification clicks. The worker only
 * shows notifications and handles their clicks: it caches nothing.
 */
export async function registerServiceWorker(): Promise<void> {
  if (registered || !canRegisterServiceWorker()) return;
  registered = true;
  navigator.serviceWorker.addEventListener("message", (e) => handleWorkerMessage(e.data));
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    registered = false;
  }
}
