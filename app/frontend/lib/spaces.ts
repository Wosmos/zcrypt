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
  getUserPublicKey,
  rotateSpace,
  updateSharedVault,
  getFileMetas,
  addFilesToSpaceBatch,
  type SpaceBatchFile,
} from "@/lib/api";
import { runPool } from "@/lib/pool";
import { checkPeerKey, pinPeerKey, KeyChangedError, type PeerKeyStatus } from "@/lib/key-pins";
import { decryptName } from "@/lib/name-crypto";
import { userNameKey } from "@/lib/sealed";
import { getQuotaData } from "@/store/quota";
import {
  fromBase64,
  toBase64,
  resolveFileKey,
  wrapKey,
  unwrapKey,
  toArrayBuffer,
} from "@/lib/crypto";
import { downloadAndDecryptFile, type DownloadOptions } from "@/lib/download-session";
import { isTauri, sidecarDownloadSpace, pickSaveLocation, subscribeProgress } from "@/lib/tauri";
import { ApiError } from "@/lib/http-error";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault, SharedVaultMember, SharedVaultFile } from "@/types";
import { tr } from "@/store/translate";

/** Create a shared space: generate its key, seal it to yourself, and create the
 *  vault carrying that grant. Caches the space key for the session. */
export async function createSpace(
  name: string,
  description = "",
  fileIds: string[] = [],
  sizeLimitBytes = 0,
): Promise<SharedVault> {
  const { publicKey } = useKeysStore.getState();
  if (!publicKey) throw new Error(tr("l10n.err.keyNotReady"));
  const spaceKey = generateSpaceKey();
  const wrapped = await sealTo(publicKey, spaceKey);
  const vault = await createSharedVault({
    name: await sealSpaceText(spaceKey, name),
    description: await sealSpaceText(spaceKey, description),
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
 *  the space key. The resulting key decrypts the file's chunks: for both the
 *  owner and any member, since it never touches the vault passphrase. */
async function spaceFileKey(vault: SharedVault, spaceWrappedCek: string): Promise<ArrayBuffer> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) throw new Error(tr("l10n.err.spaceKeyUnavailable"));
  const cek = await unwrapKey(toArrayBuffer(spaceKey), fromBase64(spaceWrappedCek));
  return toArrayBuffer(cek);
}

/** Seal a file name under the space key (AES-GCM), so members can read it. */
async function sealName(spaceKey: Uint8Array, name: string): Promise<string> {
  if (!name) return "";
  return toBase64(await wrapKey(toArrayBuffer(spaceKey), new TextEncoder().encode(name)));
}

const SEALED_TEXT_PREFIX = "s1:";

/** Seal a space's name/description under its key. The "s1:" prefix tells sealed
 *  values apart from legacy plaintext ones. */
export async function sealSpaceText(spaceKey: Uint8Array, text: string): Promise<string> {
  if (!text) return "";
  return SEALED_TEXT_PREFIX + (await sealName(spaceKey, text));
}

/** Open a value from sealSpaceText. Legacy plaintext values pass through. */
export async function openSpaceText(spaceKey: Uint8Array, value: string): Promise<string> {
  if (!value.startsWith(SEALED_TEXT_PREFIX)) return value;
  const bytes = await unwrapKey(
    toArrayBuffer(spaceKey),
    fromBase64(value.slice(SEALED_TEXT_PREFIX.length)),
  );
  return new TextDecoder().decode(bytes);
}

/** Rename / re-describe a space, sealing the text when its key is available. */
export async function updateSpaceDetails(
  vault: SharedVault,
  patch: { name?: string; description?: string; size_limit_bytes?: number },
): Promise<void> {
  const spaceKey = await loadSpaceKey(vault);
  const next = { ...patch };
  if (spaceKey) {
    if (patch.name !== undefined) next.name = await sealSpaceText(spaceKey, patch.name);
    if (patch.description !== undefined) {
      next.description = await sealSpaceText(spaceKey, patch.description);
    }
  }
  await updateSharedVault(vault.id, next);
}

export interface SealOptions {
  /** Peer user ids whose changed key the user explicitly approved. */
  acceptChangedKeys?: string[];
}

async function guardPeerKey(
  peerUserId: string,
  publicKeyB64: string,
  opts?: SealOptions,
): Promise<void> {
  const res = await checkPeerKey(peerUserId, publicKeyB64);
  if (res.status === "changed" && !opts?.acceptChangedKeys?.includes(peerUserId)) {
    throw new KeyChangedError(peerUserId, res.fingerprint, res.previous ?? "");
  }
}

/** Where a member's key stands against our pin. Never trusts the server's
 *  fingerprint string: it is recomputed from the key bytes. */
export async function memberKeyStatus(member: {
  user_id: string;
  public_key?: string;
  fingerprint?: string;
}): Promise<{ fingerprint: string; status: PeerKeyStatus | "unknown" }> {
  if (!member.public_key) return { fingerprint: member.fingerprint ?? "", status: "unknown" };
  const { fingerprint, status } = await checkPeerKey(member.user_id, member.public_key);
  return { fingerprint, status };
}

/** Decrypt a shared file's name using the space key. Returns null when the name
 *  isn't sealed (legacy shares) or the space key isn't available. */
export async function decryptSpaceFileName(
  vault: SharedVault,
  wrappedName?: string,
): Promise<string | null> {
  if (!wrappedName) return null;
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) return null;
  try {
    const bytes = await unwrapKey(toArrayBuffer(spaceKey), fromBase64(wrappedName));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Share a file you own into a space: resolve its CEK with your vault passphrase,
 *  re-wrap it under the space key, seal the file name under the same key, and
 *  register it. The server only ever sees the opaque envelope. Requires the
 *  vault to be unlocked. `name` is the plaintext file name so members can read
 *  it (the owner's server-side name is empty for zero-knowledge files). */
export async function shareFileIntoSpace(
  vault: SharedVault,
  fileId: string,
  name = "",
): Promise<void> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) throw new Error(tr("l10n.err.spaceKeyUnavailable"));
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) throw new Error(tr("l10n.err.unlockShareFiles"));

  const meta = await getFileMeta(fileId);
  // The file key under the OWNER's protection (CEK for envelope files, or the
  // derived key for legacy files): whatever decrypts this file's chunks.
  const fileKey = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
  const rewrapped = await wrapKey(toArrayBuffer(spaceKey), new Uint8Array(fileKey));
  const wrappedName = await sealName(spaceKey, name);
  await addFileToSpace(vault.id, fileId, toBase64(rewrapped), wrappedName);
}

async function plainFileName(
  meta: { encrypted_name?: string; original_name?: string },
  nameKey: CryptoKey | null,
): Promise<string> {
  if (meta.encrypted_name && nameKey) {
    try {
      const n = await decryptName(meta.encrypted_name, nameKey);
      if (n) return n;
    } catch {
      /* fall back to the legacy plaintext name */
    }
  }
  return meta.original_name || "";
}

/** Fire-and-forget: fetch metas in bulk and run every file's PBKDF2 ahead of
 *  time (6 at once) so a later shareFilesIntoSpace only pays for the wrapping. */
export function warmSpaceKeys(fileIds: string[]): void {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase || fileIds.length === 0) return;
  void (async () => {
    try {
      const metas = await getFileMetas(fileIds);
      await runPool(metas, async (m) => {
        try {
          await resolveFileKey(passphrase, fromBase64(m.salt), m.wrapped_cek);
        } catch {
          /* handled when the files are actually shared */
        }
      });
    } catch {
      /* best effort */
    }
  })();
}

const BATCH_CHUNK = 100;

export interface ShareFilesResult {
  added: string[];
  skipped: string[];
  failed: { fileId: string; error: string }[];
}

/** Share many files into a space: bulk metas, 6-wide key preparation, and
 *  batched submission (chunks of min(100, plan limit)). Preparation and
 *  submission overlap, so files appear in the space while later ones prepare. */
export async function shareFilesIntoSpace(
  vault: SharedVault,
  fileIds: string[],
  opts: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
    acceptChangedKeys?: string[];
    onChunk?: () => void;
  } = {},
): Promise<ShareFilesResult> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) throw new Error(tr("l10n.err.spaceKeyUnavailable"));
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) throw new Error(tr("l10n.err.unlockShareFiles"));

  const ids = [...new Set(fileIds)];
  const total = ids.length;
  const limit = getQuotaData()?.max_space_batch_files ?? 0;
  const chunkSize = limit > 0 ? Math.min(BATCH_CHUNK, limit) : BATCH_CHUNK;
  const result: ShareFilesResult = { added: [], skipped: [], failed: [] };
  let done = 0;
  const report = () => opts.onProgress?.(done, total);

  const metas = await getFileMetas(ids);
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const nameKey = await userNameKey().catch(() => null);

  let buffer: SpaceBatchFile[] = [];
  let submitting: Promise<void> = Promise.resolve();
  const submit = (chunk: SpaceBatchFile[]) => {
    submitting = submitting.then(async () => {
      try {
        const res = await addFilesToSpaceBatch(vault.id, chunk);
        const skipped = new Set(res.skipped ?? []);
        const rejected = new Map((res.rejected ?? []).map((r) => [r.file_id, r.reason]));
        for (const f of chunk) {
          if (skipped.has(f.file_id)) result.skipped.push(f.file_id);
          else if (rejected.has(f.file_id)) {
            result.failed.push({ fileId: f.file_id, error: rejected.get(f.file_id) as string });
          } else result.added.push(f.file_id);
        }
        opts.onChunk?.();
      } catch (err) {
        const error = err instanceof Error ? err.message : tr("l10n.err.addFilesFailed");
        for (const f of chunk) result.failed.push({ fileId: f.file_id, error });
      }
      report();
    });
  };

  await runPool(ids, async (id) => {
    if (opts.signal?.aborted) return;
    const meta = metaById.get(id);
    try {
      if (!meta) throw new Error(tr("l10n.err.fileNotFound"));
      const fileKey = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
      const rewrapped = await wrapKey(toArrayBuffer(spaceKey), new Uint8Array(fileKey));
      const wrappedName = await sealName(spaceKey, await plainFileName(meta, nameKey));
      buffer.push({ file_id: id, wrapped_cek: toBase64(rewrapped), wrapped_name: wrappedName });
    } catch (err) {
      result.failed.push({
        fileId: id,
        error: err instanceof Error ? err.message : tr("l10n.err.prepareFileFailed"),
      });
    }
    done++;
    report();
    if (buffer.length >= chunkSize) {
      const chunk = buffer;
      buffer = [];
      submit(chunk);
    }
  });
  if (buffer.length > 0 && !opts.signal?.aborted) submit(buffer);
  await submitting;
  return result;
}

/** Unshare a file from a space (editor/admin only). */
export async function unshareFileFromSpace(vaultId: string, fileId: string): Promise<void> {
  await removeFileFromSpace(vaultId, fileId);
}

/** Download + decrypt a file from a space, using the space-wrapped CEK (from the
 *  vault detail) rather than the vault passphrase: works for owner and members
 *  alike. Desktop routes through the in-process core (byos-direct bytes, native
 *  save dialog); the browser path is unchanged. */
export async function downloadSpaceFile(
  vault: SharedVault,
  fileId: string,
  spaceWrappedCek: string,
  filename: string,
  options?: DownloadOptions,
): Promise<void> {
  const keyBytes = await spaceFileKey(vault, spaceWrappedCek);

  if (isTauri) {
    const savePath = await pickSaveLocation(filename);
    if (!savePath) return; // user cancelled the save dialog
    const unlisten = options?.onProgress
      ? await subscribeProgress((p) => {
          if (p.file_id !== fileId || p.bytes_total <= 0) return;
          options.onProgress?.({
            stage: p.stage,
            percent: Math.round((p.bytes_done / p.bytes_total) * 100),
            chunksDone: p.chunks_done,
            chunksTotal: p.chunks_total,
          });
        })
      : null;
    try {
      await sidecarDownloadSpace(fileId, new Uint8Array(keyBytes), savePath);
    } finally {
      unlisten?.();
    }
    return;
  }

  await downloadAndDecryptFile(fileId, "", { ...options, resolveKey: async () => keyBytes });
}

/** Rotate a space's key so a removed member loses access for good. Generates a
 *  fresh space key, seals it to every REMAINING member's public key, and
 *  re-wraps every shared file's CEK under it. Call this AFTER removing the
 *  member. Requires the space to be unlocked (needs the old key to re-wrap).
 *  Members the server says have no published key (404) are omitted: the server
 *  re-checks that and clears their grant. */
export async function rotateSpaceKey(
  vault: SharedVault,
  remainingMembers: SharedVaultMember[],
  files: SharedVaultFile[],
  opts?: SealOptions,
): Promise<void> {
  const oldKey = await loadSpaceKey(vault);
  if (!oldKey) throw new Error(tr("l10n.err.spaceKeyUnavailable"));
  const newKey = generateSpaceKey();

  const memberGrants: { user_id: string; wrapped_space_key: string }[] = [];
  const toPin: { userId: string; publicKey: string }[] = [];
  for (const m of remainingMembers) {
    try {
      const pk = await getUserPublicKey(m.user_id);
      await guardPeerKey(m.user_id, pk.public_key, opts);
      toPin.push({ userId: m.user_id, publicKey: pk.public_key });
      memberGrants.push({
        user_id: m.user_id,
        wrapped_space_key: await sealTo(fromBase64(pk.public_key), newKey),
      });
    } catch (err) {
      if (err instanceof KeyChangedError) throw err;
      // Only a definite 404 means "no published key". Anything else (network,
      // 5xx) must abort: dropping the grant would lock that member out.
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }

  const fileWraps: { file_id: string; wrapped_cek: string; wrapped_name: string }[] = [];
  for (const f of files) {
    const cek = await unwrapKey(toArrayBuffer(oldKey), fromBase64(f.wrapped_cek));
    // Re-seal the name under the new key too; keep it empty for legacy shares
    // that were never sealed (or if the old name can't be opened).
    let wrappedName = "";
    if (f.wrapped_name) {
      try {
        const nameBytes = await unwrapKey(toArrayBuffer(oldKey), fromBase64(f.wrapped_name));
        wrappedName = toBase64(await wrapKey(toArrayBuffer(newKey), nameBytes));
      } catch {
        /* leave empty: falls back to the owner-side name */
      }
    }
    fileWraps.push({
      file_id: f.file_id,
      wrapped_cek: toBase64(await wrapKey(toArrayBuffer(newKey), cek)),
      wrapped_name: wrappedName,
    });
  }

  await rotateSpace(vault.id, memberGrants, fileWraps, {
    name: await sealSpaceText(newKey, await openSpaceText(oldKey, vault.name ?? "")),
    description: await sealSpaceText(newKey, await openSpaceText(oldKey, vault.description ?? "")),
  });
  useSpacesStore.getState().setSpaceKey(vault.id, newKey);
  for (const p of toPin) await pinPeerKey(p.userId, p.publicKey);
}

/** Share a space with another user by email: look up their public key, seal the
 *  space key to it, and add/re-grant them as a member. Throws if the target has
 *  no published key (they haven't set up sharing yet). */
export async function shareSpace(
  vaultId: string,
  spaceKey: Uint8Array,
  email: string,
  role: "viewer" | "editor" | "admin",
  opts?: SealOptions,
): Promise<SharedVaultMember> {
  const recipient = await lookupUserKey(email);
  await guardPeerKey(recipient.user_id, recipient.public_key, opts);
  const wrapped = await sealTo(fromBase64(recipient.public_key), spaceKey);
  const member = await addSharedVaultMember(vaultId, email, role, wrapped);
  await pinPeerKey(recipient.user_id, recipient.public_key);
  return member;
}

export type SpaceRole = "viewer" | "editor" | "admin";

export interface SpacePerms {
  label: "Owner" | "Admin" | "Editor" | "Viewer";
  /** Add and remove files. */
  editFiles: boolean;
  /** Invite, remove, re-role members; rename. */
  manage: boolean;
  /** Only the owner: rotate the space key. */
  rotate: boolean;
  /** Only the owner: grant admin, act on admins, delete the space. */
  owner: boolean;
}

/** What the caller may do in a space. Mirrors the backend's role checks; the
 *  server stays authoritative, this only decides what the UI offers. */
export function spacePerms(
  vault: Pick<SharedVault, "owner_id" | "role">,
  userId: string | undefined,
): SpacePerms {
  const owner = !!userId && vault.owner_id === userId;
  const admin = owner || vault.role === "admin";
  const editor = admin || vault.role === "editor";
  return {
    label: owner ? "Owner" : admin ? "Admin" : editor ? "Editor" : "Viewer",
    editFiles: editor,
    manage: admin,
    rotate: owner,
    owner,
  };
}

/** Whether the caller may change or remove this member. Admins act on viewers
 *  and editors only; the owner acts on anyone but themselves. */
export function canManageMember(
  perms: SpacePerms,
  vault: Pick<SharedVault, "owner_id">,
  member: Pick<SharedVaultMember, "user_id" | "role">,
): boolean {
  if (!perms.manage || member.user_id === vault.owner_id) return false;
  return perms.owner || member.role !== "admin";
}
