import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient shared by the React provider AND by non-component code
 * (auth-guard prefetch, the download/transfer stores, folder-protection) that
 * needs to read or invalidate server-state outside of a hook. Importing this
 * module everywhere guarantees there is exactly ONE cache — which is the whole
 * point: one source of truth for files/trash, no second stale copy.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Matches the old hand-rolled 30s freshness window: a remount within 30s
      // serves cache instantly and refetches in the background. `invalidateQueries`
      // after a mutation forces an immediate refetch regardless of this.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      // Do NOT refetch just because the window/tab regained focus. Focus and
      // visibilitychange events fire constantly during normal use (alt-tab,
      // clicking into DevTools, OS notifications), and refetching every active
      // query on each one hammers the API for no user-visible benefit. Freshness
      // is driven by staleTime + explicit invalidateQueries after mutations.
      refetchOnWindowFocus: false,
      // Only refetch on an actual network reconnect (rare, and genuinely useful).
      refetchOnReconnect: true,
    },
  },
});
