"use client";

import { useEffect, useRef } from "react";
import { subscribeEvents } from "@/lib/event-stream";
import { notifications } from "@/store/notifications";
import { toast } from "@/store/toast";
import type { ProgressEvent } from "@/types";
import type { AuditEvent } from "@/lib/auth-api";

type ProgressCallback = (event: ProgressEvent) => void;
type AuditCallback = (event: AuditEvent) => void;

// Only surface a connection warning after a SUSTAINED outage. With the shared
// stream's 1s→30s backoff, 8 consecutive failures is ~2 minutes down. A normal
// SSE reconnect (proxy idle-close, laptop sleep/wake, network blip) recovers in
// 1-2 attempts and must NOT warn: firing at 3 (~7s) was spamming an OS
// notification every few minutes.
const ERROR_THRESHOLD = 8;

export function useOperationStatus(onProgress: ProgressCallback, onAudit?: AuditCallback) {
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const auditRef = useRef(onAudit);
  auditRef.current = onAudit;

  useEffect(() => {
    let errorNotified = false;

    return subscribeEvents(
      {
        progress: (e) => {
          try {
            progressRef.current(JSON.parse(e.data) as ProgressEvent);
          } catch {
            // ignore parse errors
          }
        },
        audit: (e) => {
          try {
            auditRef.current?.(JSON.parse(e.data) as AuditEvent);
          } catch {
            // ignore parse errors
          }
        },
      },
      {
        onOpen: () => {
          if (!errorNotified) return;
          notifications.serverReconnected();
          toast.success("Server connection restored");
          errorNotified = false;
        },
        onError: (failures) => {
          // No OS-level Notification here on purpose: an SSE drop auto-recovers,
          // so an OS popup that lingers in the notification centre is noise. The
          // dismissible in-app notification is enough and it clears on reconnect.
          if (failures < ERROR_THRESHOLD || errorNotified) return;
          errorNotified = true;
          notifications.serverError("Lost connection to server. Retrying...");
          toast.error("Reconnecting to server…");
        },
      },
    );
  }, []);
}
