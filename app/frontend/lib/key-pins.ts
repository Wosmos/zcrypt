/**
 * Trust-on-first-use pins for other users' public keys. The server hands out
 * the key a space key is sealed to, so a malicious server could swap it. The
 * first key we see for a peer is pinned on this device; any later difference is
 * surfaced as "changed" and must be approved explicitly.
 */
import { get, set } from "idb-keyval";
import { fromBase64 } from "@/lib/crypto";
import { keyFingerprint } from "@/lib/keys";

export type PeerKeyStatus = "new" | "verified" | "changed";

export class KeyChangedError extends Error {
  peerUserId: string;
  fingerprint: string;
  previous: string;

  constructor(peerUserId: string, fingerprint: string, previous: string) {
    super("A person's encryption key changed since you last shared with them.");
    this.name = "KeyChangedError";
    this.peerUserId = peerUserId;
    this.fingerprint = fingerprint;
    this.previous = previous;
  }
}

async function pinKey(peerUserId: string): Promise<string | null> {
  const { useAuthStore } = await import("@/store/auth");
  const me = useAuthStore.getState().user?.id;
  return me ? `zcrypt-keypin:${me}:${peerUserId}` : null;
}

export async function checkPeerKey(
  peerUserId: string,
  publicKeyB64: string,
): Promise<{ fingerprint: string; status: PeerKeyStatus; previous?: string }> {
  const fingerprint = await keyFingerprint(fromBase64(publicKeyB64));
  try {
    const key = await pinKey(peerUserId);
    if (!key) return { fingerprint, status: "new" };
    const pinned = await get<string>(key);
    if (!pinned) return { fingerprint, status: "new" };
    if (pinned === fingerprint) return { fingerprint, status: "verified" };
    return { fingerprint, status: "changed", previous: pinned };
  } catch {
    return { fingerprint, status: "new" };
  }
}

export async function pinPeerKey(peerUserId: string, publicKeyB64: string): Promise<void> {
  try {
    const key = await pinKey(peerUserId);
    if (!key) return;
    await set(key, await keyFingerprint(fromBase64(publicKeyB64)));
  } catch {
    /* storage unavailable (private mode): pinning is best effort */
  }
}
