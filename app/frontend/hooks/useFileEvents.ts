"use client";

import { useEffect } from "react";
import { CHANGES_PAGE_LIMIT, getChanges } from "@/lib/api";
import { subscribeEvents } from "@/lib/event-stream";
import { useAuthStore } from "@/store/auth";
import { invalidateFilesViews, applyFileEvents, type FileEvent } from "@/lib/invalidate";

const DEBOUNCE_MS = 300;

/**
 * Cross-device file-event sync. Other devices/sessions mutating the vault
 * (upload, delete, rename, move, restore) push a `file` SSE event over the
 * shared /api/events stream; this hook keeps the local file/trash/quota views
 * current without the user having to refresh. It only listens while
 * authenticated.
 *
 * Every event carries the file's rev, so the highest one seen is a cursor. On a
 * reconnect, GET /api/changes?since=<cursor> returns exactly what was missed
 * while offline; with no cursor yet (or a full page, or a failed fetch) it falls
 * back to one blanket invalidation.
 */
export function useFileEvents() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!isAuthenticated) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let batch: (FileEvent | null)[] = [];
    let cursor: number | null = null;
    let disposed = false;

    function seen(rev: number) {
      if (cursor === null || rev > cursor) cursor = rev;
    }

    async function catchUp() {
      if (cursor === null) return invalidateFilesViews();
      try {
        const res = await getChanges(cursor);
        if (disposed || res.changes.length === 0) return;
        if (res.changes.length >= CHANGES_PAGE_LIMIT) return invalidateFilesViews();
        seen(res.cursor);
        return applyFileEvents(
          res.changes.map((c) => ({
            op: c.deleted ? "deleted" : "updated",
            file_id: c.file_id,
            rev: c.rev,
          })),
        );
      } catch {
        return invalidateFilesViews();
      }
    }

    const unsubscribe = subscribeEvents(
      {
        file: (e) => {
          let event: FileEvent | null = null;
          try {
            event = JSON.parse(e.data) as FileEvent;
          } catch {
            // Malformed payload: still worth a full invalidation since we know
            // *something* changed (a null entry forces that below).
          }
          if (typeof event?.rev === "number") seen(event.rev);
          batch.push(event);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const events = batch;
            batch = [];
            void applyFileEvents(events);
          }, DEBOUNCE_MS);
        },
      },
      {
        onOpen: (reconnected) => {
          if (reconnected) void catchUp();
        },
      },
    );

    return () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [isAuthenticated]);
}
