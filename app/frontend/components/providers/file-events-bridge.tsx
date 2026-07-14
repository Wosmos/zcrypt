"use client";

import { useFileEvents } from "@/hooks/useFileEvents";

/**
 * Mounts cross-device file-event sync for the authenticated app shell.
 * Renders nothing — see useFileEvents for the actual subscription.
 */
export function FileEventsBridge() {
  useFileEvents();
  return null;
}
