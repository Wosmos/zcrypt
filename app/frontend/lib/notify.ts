import { isTauri, tauriInvoke } from "@/lib/tauri";
import { isInBackground } from "@/lib/sounds";
import { usePreferencesStore, type SoundArea } from "@/store/preferences";
import { errorLabel, translateLabel } from "@/lib/transfer-progress";
import { tr } from "@/store/translate";

/** Which side of a transfer a notification is about. */
export type TransferKind = "upload" | "download";

/** Everything the app can tell the operating system about. */
export type NotifyEvent =
  | {
      type: "transferProgress";
      kind: TransferKind;
      done: number;
      total: number;
      percent: number;
      thumbnail?: string;
    }
  | {
      type: "transferDone";
      kind: TransferKind;
      count: number;
      folder: string;
      folderId?: string | null;
      failed: number;
      thumbnail?: string;
    }
  | { type: "transferFailed"; kind: TransferKind; name: string; reason: string }
  | { type: "downloadDone"; name: string }
  | { type: "newSignIn"; device: string }
  | { type: "inviteReceived"; space: string }
  | { type: "linkViewed"; name: string }
  | { type: "storageFull" };

/** How a notification reaches the person: a service worker, the desktop or Android shell, or nothing. */
export type NotifyChannel = "sw" | "tauri" | "tauri-mobile" | "none";

/** The notification permission, with "unsupported" when the channel is none. */
export type NotifyPermission = NotificationPermission | "unsupported";

type ActionId = "view" | "retry";

/** The platform-neutral shape every channel renders. */
export interface NotifyPayload {
  title: string;
  body: string;
  tag: string;
  area: SoundArea;
  image?: string;
  url: string;
  folderId?: string | null;
  click?: ActionId;
  actions: ActionId[];
  progress: boolean;
  silent: boolean;
}

const ICON = "/brand/icon-192.png";
const DASHBOARD = "/dashboard";
const TAURI_IDS: Record<string, number> = {
  "zcrypt-upload": 7101,
  "zcrypt-download": 7102,
  "zcrypt-sign-in": 7103,
  "zcrypt-invite": 7104,
  "zcrypt-link": 7105,
  "zcrypt-storage": 7106,
  "zcrypt-test": 7107,
};
/** The desktop shell cannot replace a notification on every OS, so progress there is sparser. */
export const TAURI_PROGRESS_GAP_MS = 15_000;

let lastTauriProgress = 0;
let tauriGranted = false;

/** Pick the channel for this runtime. */
export function notifyChannel(): NotifyChannel {
  if (typeof window === "undefined") return "none";
  if (isTauri) return /Android/i.test(navigator.userAgent) ? "tauri-mobile" : "tauri";
  if ("serviceWorker" in navigator && "Notification" in window) return "sw";
  return "none";
}

/** A failed transfer's cause and fix, in plain words, for a notification body. */
export function failureReason(
  kind: TransferKind,
  error: string | undefined,
  percent: number,
): string {
  return translateLabel((k, v) => tr(`transfer.${k}`, v), errorLabel(kind, error, percent));
}

function folderUrl(folderId: string | null | undefined): string {
  return folderId ? `${DASHBOARD}?open=${encodeURIComponent(folderId)}` : DASHBOARD;
}

/** Build the title, body and routing for an event. Pure: no platform calls. */
export function describeNotification(event: NotifyEvent, thumbnails: boolean): NotifyPayload {
  const base = { url: DASHBOARD, actions: [] as ActionId[], progress: false, silent: false };
  const image = (src: string | undefined) => (thumbnails && src ? { image: src } : {});
  switch (event.type) {
    case "transferProgress":
      return {
        ...base,
        title: tr(`notify.${event.kind === "upload" ? "uploading" : "downloading"}`, {
          done: event.done,
          total: event.total,
          percent: event.percent,
        }),
        body: tr("notify.progressBody"),
        tag: `zcrypt-${event.kind}`,
        area: "transfers",
        progress: true,
        silent: true,
        ...image(event.thumbnail),
      };
    case "transferDone": {
      const upload = event.kind === "upload";
      const key =
        event.count === 0
          ? "transfer.batch.allFailed"
          : upload
            ? event.failed > 0
              ? "transfer.batch.savedSomeFailed"
              : "transfer.batch.saved"
            : event.failed > 0
              ? "transfer.batch.downloadedSomeFailed"
              : "transfer.batch.downloaded";
      return {
        ...base,
        title: tr(upload ? "notify.uploadDone" : "notify.downloadDone"),
        body: tr(key, { count: event.count, folder: event.folder, failed: event.failed }),
        tag: `zcrypt-${event.kind}`,
        area: "transfers",
        url: folderUrl(event.folderId),
        folderId: event.folderId ?? null,
        click: "view",
        actions: event.failed > 0 ? ["view", "retry"] : ["view"],
        ...image(event.thumbnail),
      };
    }
    case "transferFailed":
      return {
        ...base,
        title: tr(event.kind === "upload" ? "notify.uploadFailed" : "notify.downloadFailed", {
          name: event.name,
        }),
        body: event.reason,
        tag: `zcrypt-${event.kind}`,
        area: "problems",
        actions: ["retry"],
      };
    case "downloadDone":
      return {
        ...base,
        title: tr("notify.downloadDone"),
        body: event.name,
        tag: "zcrypt-download",
        area: "transfers",
      };
    case "newSignIn":
      return {
        ...base,
        title: tr("notify.newSignIn"),
        body: tr("notify.newSignInBody", { device: event.device }),
        tag: "zcrypt-sign-in",
        area: "security",
        url: "/settings?tab=security",
      };
    case "inviteReceived":
      return {
        ...base,
        title: tr("notify.inviteReceived", { space: event.space }),
        body: tr("notify.inviteReceivedBody"),
        tag: "zcrypt-invite",
        area: "sharing",
        url: "/spaces",
      };
    case "linkViewed":
      return {
        ...base,
        title: tr("notify.linkViewed"),
        body: event.name,
        tag: "zcrypt-link",
        area: "sharing",
      };
    case "storageFull":
      return {
        ...base,
        title: tr("notify.storageFull"),
        body: tr("notify.storageFullBody"),
        tag: "zcrypt-storage",
        area: "transfers",
        url: "/settings?tab=storage",
      };
  }
}

/** The pure gate: should this payload reach the operating system? */
export function shouldNotify(
  payload: Pick<NotifyPayload, "area" | "progress">,
  channel: NotifyChannel,
  background: boolean,
  areas: Record<SoundArea, boolean>,
): boolean {
  if (channel === "none" || !background || !areas[payload.area]) return false;
  return !(payload.progress && channel === "tauri-mobile");
}

async function tauriPermission(): Promise<NotifyPermission> {
  if (tauriGranted) return "granted";
  const granted = await tauriInvoke<boolean | null>("plugin:notification|is_permission_granted");
  tauriGranted = granted === true;
  return granted === true ? "granted" : granted === false ? "denied" : "default";
}

/** The current permission for the active channel. Never prompts. */
export async function notifyPermission(): Promise<NotifyPermission> {
  const channel = notifyChannel();
  if (channel === "none") return "unsupported";
  if (channel === "sw") return Notification.permission;
  try {
    return await tauriPermission();
  } catch {
    return "unsupported";
  }
}

/**
 * Ask for permission. Call it straight from a tap: iPhone only shows the prompt
 * when the request starts inside a user gesture.
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  const channel = notifyChannel();
  if (channel === "none") return "unsupported";
  if (channel === "sw") {
    if (Notification.permission !== "default") return Notification.permission;
    return Notification.requestPermission();
  }
  try {
    const state = await tauriInvoke<string>("plugin:notification|request_permission");
    tauriGranted = state === "granted";
    return state === "granted" ? "granted" : state === "denied" ? "denied" : "default";
  } catch {
    return "unsupported";
  }
}

async function showViaWorker(p: NotifyPayload): Promise<boolean> {
  if (Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const options: NotificationOptions & Record<string, unknown> = {
    body: p.body,
    tag: p.tag,
    icon: ICON,
    badge: ICON,
    silent: p.silent,
    renotify: !p.progress,
    data: { url: p.url, folderId: p.folderId ?? null, click: p.click ?? null },
    actions: p.actions.map((action) => ({ action, title: tr(`notify.${action}`) })),
  };
  if (p.image) options.image = p.image;
  await registration.showNotification(p.title, options);
  return true;
}

async function showViaTauri(p: NotifyPayload): Promise<boolean> {
  if (p.progress) {
    const now = Date.now();
    if (now - lastTauriProgress < TAURI_PROGRESS_GAP_MS) return false;
    lastTauriProgress = now;
  } else if (p.tag.endsWith("upload") || p.tag.endsWith("download")) {
    lastTauriProgress = 0;
  }
  if ((await tauriPermission()) !== "granted") return false;
  await tauriInvoke("plugin:notification|notify", {
    options: { id: TAURI_IDS[p.tag], title: p.title, body: p.body, silent: p.silent },
  });
  return true;
}

function deliver(p: NotifyPayload, channel: NotifyChannel): Promise<boolean> {
  return channel === "sw" ? showViaWorker(p) : showViaTauri(p);
}

/**
 * Tell the operating system about an event when zcrypt is in the background.
 * Picks the channel, respects the per-area switches and the photo preview
 * choice, and never throws. Resolves true when a notification was shown.
 */
export async function notify(event: NotifyEvent): Promise<boolean> {
  const channel = notifyChannel();
  const prefs = usePreferencesStore.getState();
  const payload = describeNotification(event, prefs.notify.thumbnails);
  if (!shouldNotify(payload, channel, isInBackground(), prefs.sound.areas)) return false;
  try {
    return await deliver(payload, channel);
  } catch {
    return false;
  }
}

/** Show a sample notification right away, for the test button in Settings. */
export async function sendTestNotification(title: string, body: string): Promise<boolean> {
  const channel = notifyChannel();
  if (channel === "none") return false;
  const payload: NotifyPayload = {
    title,
    body,
    tag: "zcrypt-test",
    area: "transfers",
    url: DASHBOARD,
    actions: [],
    progress: false,
    silent: false,
  };
  try {
    return await deliver(payload, channel);
  } catch {
    return false;
  }
}

/** True on iPhone or iPad Safari outside a Home Screen install, where web notifications cannot work. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined" || isTauri) return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (!/iPhone|iPad|iPod/.test(ua) && !iPadOS) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  return !standalone;
}
