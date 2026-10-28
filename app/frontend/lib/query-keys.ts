/**
 * Central registry of TanStack Query keys. One place to look up every cache key
 * so invalidation across views stays consistent: the bug class we hit before
 * (a delete updating one view but leaving a second copy of the same data stale
 * in another) is structurally prevented by routing every read + every
 * invalidation through these keys.
 *
 * Files are stored as a single flat list (`/api/files` returns everything; the
 * explorer filters by folder client-side), so `files` is one global key, not
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
  // Per-file share links + immutable file metadata, keyed by file id. The share
  // modal and the details drawer read the SAME keys, so opening either for a
  // file you just viewed is instant and they never disagree.
  shares: (fileId: string) => ["shares", fileId] as const,
  fileMeta: (fileId: string) => ["file-meta", fileId] as const,
  // Public folder links for a given folder.
  folderShares: (folderId: string) => ["folder-shares", folderId] as const,
  // Insights/analytics: server-aggregated, keyed by the range's stable key
  // (preset + local day, or the custom dates), never by millisecond bounds, so
  // reopening the same range serves cache. The exact ISO window is computed
  // inside each queryFn at fetch time (see hooks/useAnalytics.ts).
  analyticsSummary: (rangeKey: string) => ["analytics", "summary", rangeKey] as const,
  analyticsTimeseries: (rangeKey: string, bucket: string) =>
    ["analytics", "timeseries", rangeKey, bucket] as const,
  analyticsFileTypes: (rangeKey: string) => ["analytics", "file-types", rangeKey] as const,
  analyticsStorageGrowth: ["analytics", "storage-growth"] as const,
  recentUploads: (limit: number) => ["analytics", "recent", limit] as const,
  // Admin console. One root so every admin view shares the 2m stale time and
  // keeps the previous page while a new filter/page loads.
  adminOverview: (days: number) => ["admin", "overview", "v3", days] as const,
  /** One page of a server-paged admin table, keyed by its exact query. */
  adminList: (id: string, params: Record<string, unknown>) =>
    ["admin", "list", id, params] as const,
  adminUsersMeta: ["admin", "users", "meta"] as const,
  adminUserReport: (id: string) => ["admin", "user", id, "report"] as const,
  adminUserJourney: (id: string, params: Record<string, unknown>) =>
    ["admin", "user", id, "journey", params] as const,
  adminEmails: ["admin", "emails"] as const,
  emailPrefs: ["email-prefs"] as const,
  adminUser: (id: string) => ["admin", "user", id] as const,
  adminDownloads: (days: string) => ["admin", "downloads", days] as const,
  myReview: ["review", "mine"] as const,
  adminPlans: ["admin", "plans"] as const,
  adminHealthDetails: ["admin", "health", "details"] as const,
  adminSendStorage: ["admin", "send", "storage"] as const,
  // Settings + tools. Memory only (never persisted): several hold opened
  // sealed labels.
  securityActivity: ["settings", "security-activity"] as const,
  linkedAccounts: ["settings", "linked-accounts"] as const,
  sessions: ["settings", "sessions"] as const,
  deadman: ["settings", "deadman"] as const,
  decoy: ["settings", "decoy"] as const,
  devices: (deviceId: string) => ["tools", "devices", deviceId] as const,
  syncFolders: ["tools", "sync-folders"] as const,
  expiring: ["tools", "expiring"] as const,
  integrity: ["tools", "integrity"] as const,
  snapshots: ["tools", "snapshots"] as const,
  incompleteUploads: ["uploads", "incomplete"] as const,
};
