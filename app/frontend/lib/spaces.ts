/**
 * Shared-space orchestration (zero-knowledge). A "space" is a shared vault with
 * its own random symmetric key. That key is sealed (ECIES) to each member's
 * X25519 public key, so any member can recover it with their private key while
 * the server never can. Files added to a space (P3) will have their CEK wrapped
 * under this space key so every member can decrypt them.
 */
import { generateSpaceKey, sealTo, openSealed } from "@/lib/keys";
import {
  createSharedVault,
  addSharedVaultMember,
  lookupUserKey,
  addFileToSpace,
  removeFileFromSpace,
  getFileMeta,
} from "@/lib/api";
import { fromBase64, toBase64, resolveFileKey, wrapKey, unwrapKey } from "@/lib/crypto";
import { downloadAndDecryptFile, type DownloadOptions } from "@/lib/download-session";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault, SharedVaultMember } from "@/types";

/** A Uint8Array's bytes as a standalone ArrayBuffer (used as an AES key). */
function keyBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Create a shared space: generate its key, seal it to yourself, and create the
 *  vault carrying that grant. Caches the space key for the session. */
export async function createSpace(
  name: string,
  description = "",
  fileIds: string[] = [],
  sizeLimitBytes = 0
): Promise<SharedVault> {
  const { publicKey } = useKeysStore.getState();
  if (!publicKey) throw new Error("Your encryption key isn't ready — unlock your vault first.");
  const spaceKey = generateSpaceKey();
  const wrapped = await sealTo(publicKey, spaceKey);
  const vault = await createSharedVault({
    name,
    description,
    file_ids: fileIds,
    wrapped_space_key: wrapped,
    size_limit_bytes: sizeLimitBytes,
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

/** Derive a shared file's key from its space-wrapped CEK: unwrap the CEK with
 *  the space key. The resulting key decrypts the file's chunks — for both the
 *  owner and any member, since it never touches the vault passphrase. */
async function spaceFileKey(vault: SharedVault, spaceWrappedCek: string): Promise<ArrayBuffer> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) throw new Error("This space's key isn't available — unlock your vault first.");
  const cek = await unwrapKey(keyBuffer(spaceKey), fromBase64(spaceWrappedCek));
  return keyBuffer(cek);
}

/** Share a file you own into a space: resolve its CEK with your vault passphrase,
 *  re-wrap it under the space key, and register it. The server only ever sees
 *  the space-wrapped envelope. Requires the vault to be unlocked. */
export async function shareFileIntoSpace(vault: SharedVault, fileId: string): Promise<void> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) throw new Error("This space's key isn't available — unlock your vault first.");
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) throw new Error("Unlock your vault to share files.");

  const meta = await getFileMeta(fileId);
  // The file key under the OWNER's protection (CEK for envelope files, or the
  // derived key for legacy files) — whatever decrypts this file's chunks.
  const fileKey = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
  const rewrapped = await wrapKey(keyBuffer(spaceKey), new Uint8Array(fileKey));
  await addFileToSpace(vault.id, fileId, toBase64(rewrapped));
}

/** Unshare a file from a space (editor/admin only). */
export async function unshareFileFromSpace(vaultId: string, fileId: string): Promise<void> {
  await removeFileFromSpace(vaultId, fileId);
}

/** Download + decrypt a file from a space, using the space-wrapped CEK (from the
 *  vault detail) rather than the vault passphrase — works for owner and members
 *  alike. Saves via the browser. */
export async function downloadSpaceFile(
  vault: SharedVault,
  fileId: string,
  spaceWrappedCek: string,
  options?: DownloadOptions
): Promise<void> {
  const keyBytes = await spaceFileKey(vault, spaceWrappedCek);
  await downloadAndDecryptFile(fileId, "", { ...options, resolveKey: async () => keyBytes });
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
