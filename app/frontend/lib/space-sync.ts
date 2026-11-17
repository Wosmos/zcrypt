import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { resolveSpaceId } from "@/lib/space-routes";
import type { UserEvent } from "@/lib/user-events";

/** Events that change a Space's members, role, files or existence. */
export const SPACE_SYNC_TYPES = [
  "spaceMembersChanged",
  "memberJoined",
  "memberLeft",
  "memberRemoved",
  "roleChanged",
  "spaceDeleted",
  "filesAdded",
  "inviteReceived",
] as const;

/** The Space open in the address bar, or "" when none is. */
export function openSpaceId(pathname: string, search: string): string {
  const match = /^\/spaces\/([^/]+)/.exec(pathname);
  if (!match || match[1] === "new") return "";
  return resolveSpaceId(match[1], search);
}

const GONE = new Set(["memberRemoved", "spaceDeleted"]);

/**
 * Bring cached Space data in line with an event so avatars, roles and files
 * update at once. Losing access drops the Space and, when it is open, leaves it.
 */
export function syncSpaceEvent(
  event: UserEvent,
  location: { pathname: string; search: string },
  navigate: (url: string) => void,
): void {
  const id = event.data.space_id;
  if (!id) return;
  void queryClient.invalidateQueries({ queryKey: qk.spaces });
  if (!GONE.has(event.type)) {
    void queryClient.invalidateQueries({ queryKey: qk.space(id) });
    return;
  }
  queryClient.removeQueries({ queryKey: qk.space(id) });
  if (openSpaceId(location.pathname, location.search) === id) navigate("/spaces");
}
