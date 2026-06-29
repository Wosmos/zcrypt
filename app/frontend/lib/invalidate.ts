import { queryClient } from "./query-client";
import { qk } from "./query-keys";

/**
 * Cross-view invalidation helpers. A file/folder mutation touches more than one
 * server-state view — deleting a file removes it from the vault AND adds it to
 * trash AND changes quota; restoring does the reverse; deleting a folder cascades
 * its files into trash. Routing every mutation through these helpers is what
 * structurally kills the stale-island bug class (deleted file still in a folder,
 * restored file still in trash, ghost files after a folder delete).
 */

/** After any file delete / move / restore / purge. */
export function invalidateFilesViews(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.files }),
    queryClient.invalidateQueries({ queryKey: qk.trash }),
    queryClient.invalidateQueries({ queryKey: qk.quota }),
  ]).then(() => undefined);
}

/** After a folder delete (cascades files into trash) — also refresh folders. */
export function invalidateFolderViews(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["folders"] }),
    invalidateFilesViews(),
  ]).then(() => undefined);
}
