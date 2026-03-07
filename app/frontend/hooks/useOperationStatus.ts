"use client";

import { useEffect, useRef } from "react";
import { createEventSource } from "@/lib/api";
import type { ProgressEvent } from "@/types";

type ProgressCallback = (event: ProgressEvent) => void;

export function useOperationStatus(onProgress: ProgressCallback) {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    const es = createEventSource();

    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;
        callbackRef.current(data);
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => es.close();
  }, []);
}
