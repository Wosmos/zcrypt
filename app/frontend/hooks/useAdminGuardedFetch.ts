import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Role } from "@/types";

/**
 * Fetch-on-mount scaffold shared by the admin content pages: only runs
 * `fetcher` once the current user is confirmed an admin, tracks loading/error,
 * and exposes `refresh` so callers can retry (the error panel's "Try again")
 * or refetch after a mutation. `fetcher` must be memoized (`useCallback`) with
 * its own real dependencies (route params, etc.) — a new identity re-runs it.
 */
export function useAdminGuardedFetch(fetcher: () => Promise<void>) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setError(false);
    try {
      await fetcher();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (user?.role === Role.Admin) {
      refresh();
    }
  }, [user, refresh]);

  return { user, loading, error, refresh };
}
