import { getSharedVault } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { reloadSpace, rotateSpaceKey, spacePerms } from "@/lib/spaces";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import type { SharedVaultDetail } from "@/types";

const inFlight = new Set<string>();
const failedAt = new Map<string, number>();
export const ROTATE_BACKOFF_MS = 5 * 60_000;

/** Forget recorded rotation failures (tests, sign-out). */
export function resetRotationBackoff(): void {
  failedAt.clear();
}

/**
 * Re-key a Space after a member who held the key left or was removed. Runs
 * quietly from any owner or admin device with sharing keys loaded, so the
 * Space isn't frozen until the owner comes back. A failure (a member's key
 * changed, a network error, another admin rotating first) waits 5 minutes;
 * the Rotate key button in settings stays available meanwhile.
 */
export async function rotateIfNeeded(detail: SharedVaultDetail): Promise<boolean> {
  const me = useAuthStore.getState().user?.id;
  if (!detail.needs_rotation || !useKeysStore.getState().ready) return false;
  if (!spacePerms(detail, me).rotate || inFlight.has(detail.id)) return false;
  const failed = failedAt.get(detail.id);
  if (failed !== undefined && Date.now() - failed < ROTATE_BACKOFF_MS) return false;
  inFlight.add(detail.id);
  try {
    await rotateSpaceKey(detail, detail.members ?? [], detail.files ?? []);
    failedAt.delete(detail.id);
    void queryClient.invalidateQueries({ queryKey: qk.space(detail.id) });
    void queryClient.invalidateQueries({ queryKey: qk.spaces });
    return true;
  } catch {
    failedAt.set(detail.id, Date.now());
    void reloadSpace(detail.id).catch(() => {});
    return false;
  } finally {
    inFlight.delete(detail.id);
  }
}

/** A member left or was removed: fetch the Space fresh and re-key it. */
export async function rotateForSpace(spaceId: string): Promise<void> {
  try {
    const detail = await queryClient.fetchQuery({
      queryKey: qk.space(spaceId),
      queryFn: () => getSharedVault(spaceId),
      staleTime: 0,
    });
    await rotateIfNeeded(detail);
  } catch {
    // the next Space load tries again
  }
}
