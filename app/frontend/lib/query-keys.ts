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
  adminOverview: ["admin", "overview", "v2"] as const,
  adminUsers: ["admin", "users"] as const,
  adminUser: (id: string) => ["admin", "user", id] as const,
  adminAudit: (page: number, eventType: string) => ["admin", "audit", page, eventType] as const,
  adminDownloads: (days: string) => ["admin", "downloads", days] as const,
  adminFeedback: (offset: number) => ["admin", "feedback", offset] as const,
  adminBugReports: (status: string, offset: number) =>
    ["admin", "bug-reports", status, offset] as const,
  adminReviews: (status: string, offset: number) => ["admin", "reviews", status, offset] as const,
  myReview: ["review", "mine"] as const,
  adminPlans: ["admin", "plans"] as const,
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
