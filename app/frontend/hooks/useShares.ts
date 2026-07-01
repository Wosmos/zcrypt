"use client";

import { useQuery } from "@tanstack/react-query";
import { listShares, getFileMeta } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";

/**
 * A file's share links, cached by file id. The share modal and the file details
 * drawer both read this key, so re-opening either for a file you just looked at
 * is instant, and creating/revoking a link in one view is reflected in the other
 * after `invalidateShares`.
 */
export function useSharesQuery(fileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.shares(fileId),
    queryFn: () => listShares(fileId),
    enabled: enabled && !!fileId,
  });
}

/** Refetch a file's share list after a create/revoke mutation. */
export function invalidateShares(fileId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: qk.shares(fileId) });
}

/**
 * A file's server metadata (salt, sizes, chunk count, sha256, wrapped CEK),
 * cached by id. This is effectively immutable for a given file, so opening its
 * details drawer more than once should not re-hit the API.
 */
export function useFileMetaQuery(fileId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.fileMeta(fileId),
    queryFn: () => getFileMeta(fileId),
    enabled: enabled && !!fileId,
  });
}
