/**
 * URL #fragment parsers for public share/pad/send/folder links.
 *
 * The decryption key (and, for folder links, the per-file path manifest) travels
 * in the URL fragment — never sent to the server, not even in access logs. These
 * are the ONE place that reads them, folding the four `#key=…` clones and the
 * app/f-only `&paths=…` manifest reader. SSR-guarded (fragment is client-only).
 */

/** Extract the base64 key from the URL fragment (`#key=…`), or null if absent /
 *  server-side. Same regex the four page clones used. */
export function keyFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/key=([A-Za-z0-9+/=]+)/);
  return match ? match[1] : null;
}

/**
 * Read the optional per-file directory manifest from the URL fragment
 * (`&paths=<gzip+base64>`). Maps file_id -> relative directory so a folder
 * link's "Download all" can rebuild the exact tree. Entirely client-side.
 * Returns {} when absent, server-side, or unreadable (callers then fall back to
 * a flat zip).
 *
 * NOTE: async and returns Record<string,string> to be behavior-identical to the
 * app/f `readPathManifest` it replaces (the `string[] | null` shape in the task
 * spec cannot represent this manifest and was treated as a typo).
 */
export async function pathManifestFromFragment(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const m = window.location.hash.match(/paths=([A-Za-z0-9+/=]+)/);
  if (!m) return {};
  try {
    const { gunzipSync, strFromU8 } = await import("fflate");
    const { fromBase64 } = await import("@/lib/crypto");
    const parsed = JSON.parse(strFromU8(gunzipSync(fromBase64(m[1]))));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
