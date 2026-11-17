import { completeSharedVaultMember, getSharedVault } from "@/lib/api";
import { fromBase64 } from "@/lib/crypto";
import { checkPeerKey, pinPeerKey } from "@/lib/key-pins";
import { sealTo } from "@/lib/keys";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { loadSpaceKey, spacePerms } from "@/lib/spaces";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import type { SharedVaultDetail, SharedVaultMember } from "@/types";

const inFlight = new Set<string>();

function waitingForKey(member: SharedVaultMember): boolean {
  return member.status === "pending" && !!member.public_key;
}

async function handOne(detail: SharedVaultDetail, spaceKey: Uint8Array, m: SharedVaultMember) {
  const publicKey = m.public_key!;
  const { status } = await checkPeerKey(m.user_id, publicKey);
  if (status === "changed") return false;
  const wrapped = await sealTo(fromBase64(publicKey), spaceKey);
  await completeSharedVaultMember(detail.id, m.user_id, wrapped);
  await pinPeerKey(m.user_id, publicKey);
  return true;
}

/**
 * Finish every pending invite whose invitee has published a key: seal the
 * Space key to it and send it. Runs quietly from an owner or admin device with
 * the vault unlocked. A failure leaves the member pending, so the next load or
 * key-needed event tries again. A peer whose key differs from the pin is left
 * for the member list's key warning instead of being trusted silently.
 */
export async function handOffPendingKeys(detail: SharedVaultDetail): Promise<number> {
  const me = useAuthStore.getState().user?.id;
  if (!useKeysStore.getState().ready || !spacePerms(detail, me).manage) return 0;
  const waiting = (detail.members ?? []).filter(waitingForKey);
  if (waiting.length === 0) return 0;
  let done = 0;
  try {
    const spaceKey = await loadSpaceKey(detail);
    if (!spaceKey) return 0;
    for (const m of waiting) {
      const id = `${detail.id}:${m.user_id}`;
      if (inFlight.has(id)) continue;
      inFlight.add(id);
      try {
        if (await handOne(detail, spaceKey, m)) done++;
      } catch {
        // retried on the next load
      } finally {
        inFlight.delete(id);
      }
    }
  } catch {
    return done;
  }
  if (done > 0) {
    void queryClient.invalidateQueries({ queryKey: qk.space(detail.id) });
    void queryClient.invalidateQueries({ queryKey: qk.spaces });
  }
  return done;
}

/** A pending invitee just published a key: fetch the fresh member list and hand the key over. */
export async function handOffForSpace(spaceId: string): Promise<void> {
  try {
    const detail = await queryClient.fetchQuery({
      queryKey: qk.space(spaceId),
      queryFn: () => getSharedVault(spaceId),
      staleTime: 0,
    });
    await handOffPendingKeys(detail);
  } catch {
    // the next Space load tries again
  }
}
