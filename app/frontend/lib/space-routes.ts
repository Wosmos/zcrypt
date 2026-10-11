import { isTauri } from "@/lib/tauri";

/** The one Space path the desktop static export emits; the real id rides in
 *  `?id=`, since an exported app can't serve a page per Space. */
export const SPACE_EXPORT_ID = "_";

export function spaceHref(id: string, sub: "" | "/add" | "/settings" = "", hash = ""): string {
  return isTauri
    ? `/spaces/${SPACE_EXPORT_ID}${sub}?id=${encodeURIComponent(id)}${hash}`
    : `/spaces/${id}${sub}${hash}`;
}

/** Resolve the Space id from the route param, or from `?id=` on the export path. */
export function resolveSpaceId(param: string | undefined, search: string): string {
  if (param && param !== SPACE_EXPORT_ID) return param;
  return new URLSearchParams(search).get("id") ?? "";
}
