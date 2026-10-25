"use client";

import { useEffect, useRef } from "react";
import { subscribeEvents } from "@/lib/event-stream";
import { announceNewSignIn, announceStorageFull } from "@/lib/announce";
import { parseUserAgent } from "@/lib/user-agent";
import { useAuthStore } from "@/store/auth";
import { useQuotaQuery } from "@/store/quota";
import type { AuditEvent, QuotaInfo } from "@/types";

const SIGN_IN_EVENTS = new Set(["login", "oauth_login", "magic_link_used"]);

/** True when the account has a cap and has reached it. */
export function isStorageFull(quota: QuotaInfo | null | undefined): boolean {
  return Boolean(
    quota && !quota.is_unlimited && quota.quota_bytes > 0 && quota.used_bytes >= quota.quota_bytes,
  );
}

/** True for a sign-in to this account that did not come from this browser. */
export function isForeignSignIn(
  event: AuditEvent,
  userId: string | undefined,
  ua: string,
): boolean {
  if (!SIGN_IN_EVENTS.has(event.event_type)) return false;
  if (!userId || event.user_id !== userId) return false;
  return event.user_agent !== ua;
}

/**
 * Turns server signals into alerts: a sign-in from another device (live audit
 * events) and storage filling up (the quota query going from room left to full).
 */
export function useAlertEvents(): void {
  const quota = useQuotaQuery().data;
  const full = isStorageFull(quota);
  const seenRoom = useRef(false);

  useEffect(() => {
    if (!quota) return;
    if (!full) {
      seenRoom.current = true;
      return;
    }
    if (seenRoom.current) announceStorageFull();
    seenRoom.current = false;
  }, [quota, full]);

  useEffect(
    () =>
      subscribeEvents({
        audit: (e) => {
          let event: AuditEvent;
          try {
            event = JSON.parse(e.data) as AuditEvent;
          } catch {
            return;
          }
          const userId = useAuthStore.getState().user?.id;
          if (isForeignSignIn(event, userId, navigator.userAgent))
            announceNewSignIn(parseUserAgent(event.user_agent));
        },
      }),
    [],
  );
}
