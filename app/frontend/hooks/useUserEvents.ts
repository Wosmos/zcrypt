"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeEvents } from "@/lib/event-stream";
import { handOffForSpace } from "@/lib/space-handoff";
import { SPACE_SYNC_TYPES, syncSpaceEvent } from "@/lib/space-sync";
import { deliverUserEvent, NOTICE_TYPES, parseUserEvent } from "@/lib/user-events";

/**
 * Turns the server's user events into a toast or a system notification,
 * whichever fits whether zcrypt is in view, and keeps Space data current.
 * One shared /api/events stream feeds it, and it stays open while the window
 * is hidden or in the tray.
 */
export function useUserEvents(): void {
  const router = useRouter();

  useEffect(() => {
    const navigate = (url: string) => router.push(url);
    const types = new Set<string>([...NOTICE_TYPES, ...SPACE_SYNC_TYPES, "spaceKeyNeeded"]);
    const notices = new Set<string>(NOTICE_TYPES);
    const listeners = Object.fromEntries(
      [...types].map((type) => [
        type,
        (e: MessageEvent) => {
          const event = parseUserEvent(type, e.data);
          if (!event) return;
          if (type === "spaceKeyNeeded") {
            if (event.data.space_id) void handOffForSpace(event.data.space_id);
            return;
          }
          if (notices.has(type)) void deliverUserEvent(event, navigate);
          if (SPACE_SYNC_TYPES.some((t) => t === type))
            syncSpaceEvent(event, window.location, navigate);
        },
      ]),
    );
    return subscribeEvents(listeners);
  }, [router]);
}
