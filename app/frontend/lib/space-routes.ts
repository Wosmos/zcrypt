import { ROUTE_SHELL_ID, resolveRouteId, shellHref } from "@/lib/route-shell";

/** The one prerendered Space path; the real id rides in `?id=`. */
export const SPACE_EXPORT_ID = ROUTE_SHELL_ID;

export function spaceHref(id: string, sub: "" | "/add" | "/settings" = "", hash = ""): string {
  return shellHref("/spaces", id, sub, hash);
}

/** Resolve the Space id from the route param, or from `?id=` on the shell path. */
export const resolveSpaceId = resolveRouteId;
