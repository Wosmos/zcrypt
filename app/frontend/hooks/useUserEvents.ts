"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeEvents } from "@/lib/event-stream";
import { deliverUserEvent, NOTICE_TYPES, parseUserEvent } from "@/lib/user-events";

/**
 * Turns the server's user events into a toast or a system notification,
 * whichever fits whether zcrypt is in view. One shared /api/events stream
 * feeds it, and it stays open while the window is hidden or in the tray.
 */
export function useUserEvents(): void {
  const router = useRouter();

  useEffect(() => {
    const navigate = (url: string) => router.push(url);
    const listeners = Object.fromEntries(
      NOTICE_TYPES.map((type) => [
        type,
        (e: MessageEvent) => {
          const event = parseUserEvent(type, e.data);
          if (event) void deliverUserEvent(event, navigate);
        },
      ]),
    );
    return subscribeEvents(listeners);
  }, [router]);
}
