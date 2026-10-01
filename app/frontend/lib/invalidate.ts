import { queryClient } from "./query-client";
import { qk } from "./query-keys";

/**
 * Cross-view invalidation helpers. A file/folder mutation touches more than one
 * server-state view: deleting a file removes it from the vault AND adds it to
 * trash AND changes quota; restoring does the reverse; deleting a folder cascades
 * its files into trash. Routing every mutation through these helpers is what
 * structurally kills the stale-island bug class (deleted file still in a folder,
 * restored file still in trash, ghost files after a folder delete).
 */

// Insights totals move with every upload or delete. Marked stale without a
// refetch, so a hidden Insights view costs nothing and refetches on next visit.
function staleAnalytics(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ["analytics"], refetchType: "none" });
}

/** After any file delete / move / restore / purge. */
export function invalidateFilesViews(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.files }),
    queryClient.invalidateQueries({ queryKey: qk.trash }),
    queryClient.invalidateQueries({ queryKey: qk.quota }),
    staleAnalytics(),
  ]).then(() => undefined);
}

/** After a folder delete (cascades files into trash), also refresh folders. */
export function invalidateFolderViews(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["folders"] }),
    invalidateFilesViews(),
  ]).then(() => undefined);
}

/** One cross-device `file` SSE event (see backend /api/events contract). */
export interface FileEvent {
  op: "added" | "updated" | "deleted" | "restored" | "moved" | "renamed";
  file_id: string;
  rev: number;
}

/**
 * Apply a debounced batch of file events. The payload carries no row data, so
 * only a delete can be applied in place: the row is patched out of the cached
 * list and just trash + quota refetch. Anything else (or an unreadable event)
 * needs the server's copy, so the batch falls back to the full invalidation.
 */
export function applyFileEvents(events: (FileEvent | null)[]): Promise<void> {
  const deletes = events.every((e) => e?.op === "deleted");
  if (events.length === 0 || !deletes) return invalidateFilesViews();
  const gone = new Set(events.map((e) => (e as FileEvent).file_id));
  queryClient.setQueryData<{ id: string }[]>(qk.files, (prev) =>
    prev ? prev.filter((f) => !gone.has(f.id)) : prev,
  );
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.trash }),
    queryClient.invalidateQueries({ queryKey: qk.quota }),
    staleAnalytics(),
  ]).then(() => undefined);
}
