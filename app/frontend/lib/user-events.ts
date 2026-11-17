import { getSharedVault } from "@/lib/api";
import { notify, describeNotification, eventTag, type NotifyEvent } from "@/lib/notify";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { isInBackground } from "@/lib/sounds";
import { loadSpaceKey, openSpaceText } from "@/lib/spaces";
import { toast } from "@/store/toast";
import { usePreferencesStore } from "@/store/preferences";
import { tr } from "@/store/translate";
import type { SharedVault } from "@/types";

/** A live event as /api/events sends it: ids and counts only, plus where it leads. */
export interface UserEvent {
  type: string;
  data: Record<string, string>;
  url: string;
}

/** Events the person is told about. The sync-only ones (members changed, key needed) are not here. */
export const NOTICE_TYPES = [
  "inviteReceived",
  "invitePending",
  "memberJoined",
  "memberLeft",
  "memberRemoved",
  "roleChanged",
  "spaceDeleted",
  "filesAdded",
  "newSignIn",
  "linkViewed",
] as const;

export type Delivered = "toast" | "notification" | "skipped";

/** Read one SSE message into an event, or null when it is not one. */
export function parseUserEvent(type: string, raw: string): UserEvent | null {
  try {
    const body = JSON.parse(raw) as Partial<UserEvent> | null;
    if (!body || typeof body !== "object") return null;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.data ?? {})) data[k] = String(v);
    return { type, data, url: typeof body.url === "string" ? body.url : "" };
  } catch {
    return null;
  }
}

/** The Space as last fetched, read before anything refreshes or drops it. */
export function cachedSpace(spaceId: string | undefined): SharedVault | undefined {
  if (!spaceId) return undefined;
  const detail = queryClient.getQueryData<SharedVault>(qk.space(spaceId));
  if (detail) return detail;
  return queryClient.getQueryData<SharedVault[]>(qk.spaces)?.find((v) => v.id === spaceId);
}

async function openName(vault: SharedVault): Promise<string> {
  if (!vault.name.startsWith("s1:")) return vault.name || tr("notify.aSpace");
  try {
    const key = await loadSpaceKey(vault);
    return (key && (await openSpaceText(key, vault.name))) || tr("notify.aSpace");
  } catch {
    return tr("notify.aSpace");
  }
}

async function spaceName(event: UserEvent, known: SharedVault | undefined): Promise<string> {
  let vault = known;
  const gone = event.type === "memberRemoved" || event.type === "spaceDeleted";
  if (!vault && !gone && event.data.space_id) {
    vault = await queryClient
      .fetchQuery({
        queryKey: qk.space(event.data.space_id),
        queryFn: () => getSharedVault(event.data.space_id!),
      })
      .catch(() => undefined);
  }
  return vault ? openName(vault) : tr("notify.aSpace");
}

/** Turn an event into the notification model, or null for a type with no copy. */
export async function describeUserEvent(
  event: UserEvent,
  known: SharedVault | undefined = cachedSpace(event.data.space_id),
): Promise<NotifyEvent | null> {
  const { type, data, url } = event;
  const route = { url: url || undefined, tag: eventTag(type, data) };
  const name = data.username || tr("notify.someone");
  switch (type) {
    case "newSignIn":
      return { type, device: data.device || "", ...route };
    case "linkViewed":
      return { type, name: data.name || "", ...route };
    case "invitePending":
      return { type, name, ...route };
    case "inviteReceived":
      return {
        type,
        space: await spaceName(event, known),
        name: data.username || undefined,
        ...route,
      };
    case "memberRemoved":
    case "spaceDeleted": {
      return { type, space: await spaceName(event, known), ...route };
    }
    case "memberJoined":
    case "memberLeft":
      return { type, name, space: await spaceName(event, known), ...route };
    case "roleChanged":
      return { type, space: await spaceName(event, known), role: data.role ?? "viewer", ...route };
    case "filesAdded":
      return {
        type,
        name,
        space: await spaceName(event, known),
        count: Number(data.count) || 1,
        ...route,
      };
    default:
      return null;
  }
}

/**
 * Tell the person about an event once: a toast while zcrypt is in view, an
 * operating system notification while it is hidden or unfocused. Never both.
 */
export async function deliverUserEvent(
  event: UserEvent,
  navigate: (url: string) => void,
): Promise<Delivered> {
  const model = await describeUserEvent(event);
  if (!model) return "skipped";
  const prefs = usePreferencesStore.getState();
  const payload = describeNotification(model, false);
  if (!prefs.sound.areas[payload.area]) return "skipped";

  if (isInBackground()) {
    await notify(model);
    return "notification";
  }
  const show = model.type === "newSignIn" ? toast.warning : toast.info;
  show(
    payload.title,
    { label: tr("notify.open"), onClick: () => navigate(payload.url) },
    {
      detail: payload.body || undefined,
      key: payload.tag,
      sound: { event: "headsUp", area: payload.area },
    },
  );
  return "toast";
}
