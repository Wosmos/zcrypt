/**
 * Pages under a dynamic segment are prerendered once, at `<base>/_`. The site
 * serves that stored page for every id instead of rendering one per request
 * (Cloudflare's free plan allows 10 ms of CPU), and the desktop static export
 * can only emit that one path. Links carry the id in `?id=`; older and shared
 * links with the id in the path redirect there (next.config.ts).
 */
export const ROUTE_SHELL_ID = "_";

export const ROUTE_SHELL_PARAMS = [{ id: ROUTE_SHELL_ID }];
export const TOKEN_SHELL_PARAMS = [{ token: ROUTE_SHELL_ID }];

export function shellHref(base: string, id: string, sub = "", hash = ""): string {
  return `${base}/${ROUTE_SHELL_ID}${sub}?id=${encodeURIComponent(id)}${hash}`;
}

/** The id from the route param, or from `?id=` on the shell path. */
export function resolveRouteId(param: string | undefined, search: string): string {
  if (param && param !== ROUTE_SHELL_ID) return param;
  const id = new URLSearchParams(search).get("id") ?? "";
  return id === ROUTE_SHELL_ID ? "" : id;
}
