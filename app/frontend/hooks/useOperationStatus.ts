"use client";

import { useEffect, useRef } from "react";
import { createEventSource } from "@/lib/api";
import { notifications } from "@/store/notifications";
import { toast } from "@/store/toast";
import type { ProgressEvent } from "@/types";
import type { AuditEvent } from "@/lib/auth-api";

type ProgressCallback = (event: ProgressEvent) => void;
type AuditCallback = (event: AuditEvent) => void;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_DELAY = 1_000;
// Only surface a connection warning after a SUSTAINED outage. With the 1s→30s
// backoff below, 8 consecutive failures is ~2 minutes down. A normal SSE
// reconnect (proxy idle-close, laptop sleep/wake, network blip) recovers in
// 1-2 attempts and must NOT warn — firing at 3 (~7s) was spamming an OS
// notification every few minutes.
const ERROR_THRESHOLD = 8;

export function useOperationStatus(
  onProgress: ProgressCallback,
  onAudit?: AuditCallback
) {
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const auditRef = useRef(onAudit);
  auditRef.current = onAudit;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let hadConnection = false;
    let errorNotified = false;

    function connect() {
      if (disposed) return;

      es = createEventSource();

      es.addEventListener("progress", (e) => {
        try {
          const data = JSON.parse(e.data) as ProgressEvent;
          progressRef.current(data);
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("audit", (e) => {
        try {
          const data = JSON.parse(e.data) as AuditEvent;
          auditRef.current?.(data);
        } catch {
          // ignore parse errors
        }
      });

      es.onopen = () => {
        // If we had a disconnection and are now reconnected, notify
        if (hadConnection && errorNotified) {
          notifications.serverReconnected();
          toast.success("Server connection restored");
          errorNotified = false;
        }
        hadConnection = true;
        reconnectAttempt = 0;
      };

      es.onerror = () => {
        es?.close();
        es = null;

        if (disposed) return;

        // Notify about server issues after threshold consecutive failures
        if (reconnectAttempt >= ERROR_THRESHOLD && !errorNotified) {
          errorNotified = true;
          notifications.serverError("Lost connection to server. Retrying...");
          toast.error("Reconnecting to server…");
          // No OS-level Notification here on purpose: an SSE drop auto-recovers,
          // so an OS popup that lingers in the notification centre is noise. The
          // dismissible in-app notification above is enough and it clears on
          // reconnect (serverReconnected below).
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
        const delay = Math.min(BASE_DELAY * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
        reconnectAttempt++;

        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
