"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COOLDOWN_MS = 5 * 60_000;

/**
 * Client-side cooldown gate for a manual "Refresh" action: fires `fn` at most
 * once per COOLDOWN_MS, so a user mashing the button can't spam the backend
 * into repeated real DB aggregation work. This is a UX nicety on top of (not
 * instead of) the server-side per-user rate limit
 * (AnalyticsRateLimitMiddleware in app/backend/cmd/auth_middleware.go), which
 * is what actually enforces the ceiling against multiple tabs, another
 * device, or a direct API call with a stolen/valid token.
 */
export function useRefreshCooldown(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (remainingMs <= 0) return;
    const id = setInterval(() => {
      const left = COOLDOWN_MS - (Date.now() - lastRunRef.current);
      setRemainingMs(left > 0 ? left : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [remainingMs]);

  const trigger = useCallback(async () => {
    if (busy || remainingMs > 0) return;
    setBusy(true);
    try {
      await fn();
      lastRunRef.current = Date.now();
      setRemainingMs(COOLDOWN_MS);
    } finally {
      setBusy(false);
    }
  }, [busy, remainingMs, fn]);

  return { canRefresh: !busy && remainingMs <= 0, busy, remainingMs, trigger };
}
