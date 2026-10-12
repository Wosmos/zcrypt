"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import {
  connectionStatus,
  startConnectivity,
  useConnectivityStore,
  type ConnectionStatus,
} from "@/store/connectivity";
import { isNetworkFailure } from "@/lib/http-error";

export const RECOVERY_FLASH_MS = 3_000;

/** Watches the connection while mounted and returns the one status to show,
 *  plus a short "back online" window after a recovery. */
export function useConnectivity() {
  useEffect(() => startConnectivity(), []);
  const state = useConnectivityStore(
    useShallow((s) => ({
      status: connectionStatus(s),
      known: s.backend !== "unknown",
      nextRetryAt: s.nextRetryAt,
      checking: s.checking,
      recoveredAt: s.recoveredAt,
      check: s.check,
    })),
  );

  const [now, setNow] = useState(() => Date.now());
  const recovering = state.recoveredAt !== null && now - state.recoveredAt < RECOVERY_FLASH_MS;
  const retryAt = isBlockingStatus(state.status) ? state.nextRetryAt : null;
  const ticking = retryAt !== null || state.recoveredAt !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [ticking]);

  const retryIn = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1_000));
  return { ...state, recovering, retryIn };
}

/** True while requests can't succeed: offline, servers down, or maintenance. */
export function isBlockingStatus(status: ConnectionStatus): boolean {
  return status === "offline" || status === "down" || status === "maintenance";
}

/** Read-only view for controls that should disable themselves while blocked. */
export function useConnectionBlocked(): boolean {
  return useConnectivityStore((s) => isBlockingStatus(connectionStatus(s)));
}

/** Turns a caught error into something a person can act on: a connection
 *  failure reads "can't reach zcrypt" instead of the browser's "Failed to fetch". */
export function useFriendlyError() {
  const t = useTranslations("ui.connection");
  return (err: unknown, fallback: string): string => {
    if (isNetworkFailure(err)) return t("requestFailed");
    return err instanceof Error && err.message ? err.message : fallback;
  };
}
