"use client";

import { useCallback, useEffect } from "react";
import { getMyKey } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";

/**
 * Recovery-kit status for the signed-in account. Filled when the keypair loads;
 * for a locked vault it is fetched once from the key record. `status` is null
 * until the server has answered.
 */
export function useRecoveryKit() {
  const status = useKeysStore((s) => s.recoveryKit);
  const signedIn = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!signedIn || useKeysStore.getState().recoveryKit) return;
    let cancelled = false;
    getMyKey()
      .then((record) => {
        if (cancelled || !record || useKeysStore.getState().recoveryKit) return;
        useKeysStore.setState({
          recoveryKit: {
            set: record.recovery_kit_set === true,
            createdAt: record.recovery_kit_created_at ?? null,
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const markSet = useCallback((createdAt: string) => {
    useKeysStore.setState({ recoveryKit: { set: true, createdAt } });
  }, []);
  const markRemoved = useCallback(() => {
    useKeysStore.setState({ recoveryKit: { set: false, createdAt: null } });
  }, []);

  return { status, markSet, markRemoved };
}
