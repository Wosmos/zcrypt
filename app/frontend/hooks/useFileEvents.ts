"use client";

import { useEffect } from "react";
import { createEventSource } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { invalidateFilesViews } from "@/lib/invalidate";

const DEBOUNCE_MS = 300;
const MAX_RECONNECT_DELAY = 30_000;
const BASE_DELAY = 1_000;

/** Payload shape of the `file` SSE event (see backend /api/events contract). */
interface FileEvent {
  op: "added" | "updated" | "deleted" | "restored" | "moved" | "renamed";
  file_id: string;
  rev: number;
}

/**
 * Cross-device file-event sync. Other devices/sessions mutating the vault
 * (upload, delete, rename, move, restore) push a `file` SSE event over the
 * existing /api/events stream; this hook keeps the local file/trash/quota
 * views current without the user having to refresh.
 *
 * There's no shared EventSource singleton in this codebase today (each
 * consumer — useOperationStatus, devices-tab — opens its own via
 * createEventSource()), so this hook follows the same pattern rather than
 * inventing a new seam. It only connects while authenticated.
 *
 * Reconnects use the same manual exponential backoff as useOperationStatus:
 * without an onerror handler here, the browser's native EventSource retry
 * (a fixed ~3s interval, uncapped) would re-fire the reconnect invalidation
 * below on every retry — turning a flaky connection into a runaway refetch
 * loop against every active session's files/trash/quota queries.
 */
export function useFileEvents() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!isAuthenticated) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let hadConnection = false;
    let disposed = false;
    let reconnectAttempt = 0;
    let es: EventSource | null = null;

    function connect() {
      if (disposed) return;

      es = createEventSource();

      es.addEventListener("file", (e: MessageEvent) => {
        try {
          JSON.parse(e.data) as FileEvent;
        } catch {
          // Malformed payload — still worth an invalidation pass below since we
          // know *something* changed, but skip acting on the (unusable) data.
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void invalidateFilesViews();
        }, DEBOUNCE_MS);
      });

      es.onopen = () => {
        // First open isn't a "reconnect" — nothing was missed. Every open after
        // that means we may have missed events while disconnected, so do one
        // catch-up invalidation.
        // TODO: once GET /api/changes?since=<seq> ships, replace this blanket
        // invalidate with a cursor-based diff fetch (track the last-seen `rev`/
        // seq and only pull what changed instead of refetching every view).
        if (hadConnection) {
          void invalidateFilesViews();
        }
        hadConnection = true;
        reconnectAttempt = 0;
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (disposed) return;

        const delay = Math.min(BASE_DELAY * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
        reconnectAttempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [isAuthenticated]);
}
