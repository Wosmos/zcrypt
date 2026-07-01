import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { listFolders } from "@/lib/api";

/**
 * BFS a folder's whole subtree and return every folder id it contains (incl. the
 * root). Each level is fetched through the shared folders query cache (the same
 * key the explorer populates), so already-browsed levels are cache hits.
 */
export async function collectSubtreeFolderIds(rootId: string): Promise<Set<string>> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const lists = await Promise.all(
      frontier.map((id) =>
        queryClient
          .fetchQuery({ queryKey: qk.folders(id), queryFn: () => listFolders(id) })
          .catch(() => [])
      )
    );
    const next: string[] = [];
    for (const list of lists) {
      for (const f of list) {
        if (!ids.has(f.id)) {
          ids.add(f.id);
          next.push(f.id);
        }
      }
    }
    frontier = next;
  }
  return ids;
}
