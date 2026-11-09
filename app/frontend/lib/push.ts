import { API_BASE } from "@/lib/config";
import { authedFetch } from "@/lib/auth-fetch";
import { canRegisterServiceWorker, registerServiceWorker } from "@/lib/service-worker";

/**
 * Web Push: sign-ins, Space invites and opened share links reach this browser
 * even while zcrypt is closed. The browser's own push service carries them,
 * encrypted to this browser, and public/sw.js turns them into notifications.
 * Not offered inside the desktop or Android app, whose web views have no push.
 */

export type PushResult = "on" | "denied" | "unsupported" | "error";

export function canPush(): boolean {
  return canRegisterServiceWorker() && "PushManager" in window && "Notification" in window;
}

/** This browser's push subscription, or null when it has none. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!canPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

function postJSON(path: string, body: unknown): Promise<Response> {
  return authedFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Asks for permission if needed, subscribes this browser and registers it. */
export async function enablePush(): Promise<PushResult> {
  if (!canPush()) return "unsupported";
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";
  try {
    await registerServiceWorker();
    const reg = await navigator.serviceWorker.ready;
    const keyRes = await authedFetch(`${API_BASE}/api/push/key`);
    if (!keyRes.ok) return "error";
    const { public_key } = (await keyRes.json()) as { public_key: string };
    const key = urlBase64ToBytes(public_key);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = sub.toJSON();
    const saved = await postJSON("/api/push/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys,
      lang: document.documentElement.lang || navigator.language,
    });
    return saved.ok ? "on" : "error";
  } catch {
    return "error";
  }
}

/** Stops push to this browser, here and on the server. Never throws. */
export async function disablePush(): Promise<void> {
  try {
    const sub = await currentPushSubscription();
    if (!sub) return;
    await postJSON("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  } catch {
    // Push already unavailable here: nothing to release.
  }
}

/**
 * Before signing out: this browser stops getting the account's notifications,
 * so a shared computer doesn't keep showing them. Bounded so a slow network
 * can't hold up the sign-out.
 */
export function releasePushOnSignOut(): Promise<void> {
  return Promise.race([disablePush(), new Promise<void>((r) => setTimeout(r, 3000))]);
}
