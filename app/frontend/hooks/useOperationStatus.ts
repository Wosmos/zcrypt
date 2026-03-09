"use client";

import { useEffect, useRef } from "react";
import { createEventSource } from "@/lib/api";
import type { ProgressEvent } from "@/types";

type ProgressCallback = (event: ProgressEvent) => void;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_DELAY = 1_000;

export function useOperationStatus(onProgress: ProgressCallback) {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      es = createEventSource();

      es.addEventListener("progress", (e) => {
        try {
          const data = JSON.parse(e.data) as ProgressEvent;
          callbackRef.current(data);
        } catch {
          // ignore parse errors
        }
      });

      es.onopen = () => {
        reconnectAttempt = 0;
      };

      es.onerror = () => {
        es?.close();
        es = null;

        if (disposed) return;

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
