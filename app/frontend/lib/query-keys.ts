/**
 * Central registry of TanStack Query keys. One place to look up every cache key
 * so invalidation across views stays consistent — the bug class we hit before
 * (a delete updating one view but leaving a second copy of the same data stale
 * in another) is structurally prevented by routing every read + every
 * invalidation through these keys.
 *
 * Files are stored as a single flat list (`/api/files` returns everything; the
 * explorer filters by folder client-side), so `files` is one global key — not
 * per-folder.
 */
export const qk = {
  files: ["files"] as const,
  trash: ["trash"] as const,
  folders: (parentId: string | null = null) => ["folders", parentId] as const,
  quota: ["quota"] as const,
  platforms: ["platforms"] as const,
  repos: ["repos"] as const,
  // Shared spaces: the list, and each space's full detail (members + files),
  // keyed by id so opening a space you viewed recently is instant from cache.
  spaces: ["spaces"] as const,
  space: (id: string) => ["space", id] as const,
};
