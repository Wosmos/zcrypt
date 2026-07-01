/**
 * Shared-space orchestration (zero-knowledge). A "space" is a shared vault with
 * its own random symmetric key. That key is sealed (ECIES) to each member's
 * X25519 public key, so any member can recover it with their private key while
 * the server never can. Files added to a space (P3) will have their CEK wrapped
 * under this space key so every member can decrypt them.
 */
import { generateSpaceKey, sealTo, openSealed } from "@/lib/keys";
import { createSharedVault, addSharedVaultMember, lookupUserKey } from "@/lib/api";
import { fromBase64 } from "@/lib/crypto";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import type { SharedVault, SharedVaultMember } from "@/types";

/** Create a shared space: generate its key, seal it to yourself, and create the
 *  vault carrying that grant. Caches the space key for the session. */
export async function createSpace(name: string, description = ""): Promise<SharedVault> {
  const { publicKey } = useKeysStore.getState();
  if (!publicKey) throw new Error("Your encryption key isn't ready — unlock your vault first.");
  const spaceKey = generateSpaceKey();
  const wrapped = await sealTo(publicKey, spaceKey);
  const vault = await createSharedVault({
    name,
    description,
    file_ids: [],
    wrapped_space_key: wrapped,
  });
  useSpacesStore.getState().setSpaceKey(vault.id, spaceKey);
  return vault;
}

/** Recover + cache a space's key from the caller's own grant. Returns null for
 *  legacy metadata-only vaults that carry no grant for us. */
export async function loadSpaceKey(vault: SharedVault): Promise<Uint8Array | null> {
  const cached = useSpacesStore.getState().spaceKeys[vault.id];
  if (cached) return cached;
  if (!vault.wrapped_space_key) return null;
  const key = await openSealed(vault.wrapped_space_key);
  useSpacesStore.getState().setSpaceKey(vault.id, key);
  return key;
}

/** Share a space with another user by email: look up their public key, seal the
 *  space key to it, and add/re-grant them as a member. Throws if the target has
 *  no published key (they haven't set up sharing yet). */
export async function shareSpace(
  vaultId: string,
  spaceKey: Uint8Array,
  email: string,
  role: "viewer" | "editor" | "admin"
): Promise<SharedVaultMember> {
  const recipient = await lookupUserKey(email);
  const wrapped = await sealTo(fromBase64(recipient.public_key), spaceKey);
  return addSharedVaultMember(vaultId, email, role, wrapped);
}
