/**
 * Public single-file link (zero-knowledge). Mirrors lib/folder-share.ts: recover
 * the file's CEK with the vault passphrase, re-wrap it under a fresh random share
 * key, and create the share storing only that share-wrapped envelope. The share
 * key lives only in the returned URL #fragment and never reaches the server, so
 * anyone with the link can decrypt, no account needed.
 *
 * Single home for the copy-pasted file-share crypto flow (previously duplicated
 * in the details drawer and the share modal). Callers keep their own form state,
 * toasts, and cache refresh: this just performs the crypto + create + URL build,
 * plus the shares-cache invalidation so the drawer/modal reflect the new link.
 */
import {
  resolveFileKey,
  generateCEK,
  wrapKey,
  fromBase64,
  toBase64,
  toArrayBuffer,
} from "@/lib/crypto";
import { getFileMeta, createShare, type FileMetaResponse } from "@/lib/api";
import { decryptName } from "@/lib/name-crypto";
import { sealText, keyFromBytes, userNameKey } from "@/lib/sealed";
import { invalidateShares } from "@/hooks/useShares";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { usePassphraseStore } from "@/store/passphrase";
import { tr } from "@/store/translate";

/**
 * The owner's file name, sealed under a link key so a recipient can save the
 * file under its real name while the server only ever sees ciphertext. Uses the
 * decrypted `encrypted_name`, falling back to the legacy plaintext name.
 * Returns undefined when no readable name exists (the recipient then sniffs one).
 */
export async function sealFileNameForLink(
  meta: { encrypted_name?: string; original_name?: string },
  nameKey: CryptoKey | null,
  linkKey: CryptoKey,
): Promise<string | undefined> {
  let name = "";
  if (meta.encrypted_name && nameKey) {
    try {
      name = await decryptName(meta.encrypted_name, nameKey);
    } catch {
      name = "";
    }
  }
  name = name || meta.original_name || "";
  return name ? sealText(name, linkKey) : undefined;
}

export interface FileShareOptions {
  password?: string;
  expiresHours?: number;
  maxDownloads?: number;
}

type WarmEntry = { meta: FileMetaResponse; cek: Uint8Array };
const warmed = new Map<string, Promise<WarmEntry>>();
let lockWatched = false;

function watchLock(): void {
  if (lockWatched || typeof usePassphraseStore.subscribe !== "function") return;
  lockWatched = true;
  usePassphraseStore.subscribe((s) => {
    if (!s.cachedPassphrase) clearFileShareCache();
  });
}

/** Drop every warmed key (vault lock; also used by tests). */
export function clearFileShareCache(): void {
  warmed.clear();
}

function prepareFileKey(fileId: string, password: string): Promise<WarmEntry> {
  const key = `${fileId}\u0000${password}`;
  const hit = warmed.get(key);
  if (hit) return hit;
  watchLock();
  const p = (async () => {
    const meta = await getFileMeta(fileId);
    if (!meta.wrapped_cek) {
      throw new Error(tr("l10n.err.fileLegacy"));
    }
    const cekBuf = await resolveFileKey(password, fromBase64(meta.salt), meta.wrapped_cek);
    return { meta, cek: new Uint8Array(cekBuf) };
  })();
  warmed.set(key, p);
  p.catch(() => {
    if (warmed.get(key) === p) warmed.delete(key);
  });
  return p;
}

/** Fetch the file's meta and run its key derivation ahead of time (e.g. when
 *  the share dialog opens) so creating the link afterwards is near-instant.
 *  Cleared when the vault locks. Best effort. */
export function warmFileShareKey(fileId: string): void {
  if (!usePassphraseStore.getState().getPassphrase()) return;
  resolveFilePasswordGlobal(fileId)
    .then((password) => prepareFileKey(fileId, password))
    .catch(() => {});
}

/**
 * Create a public link for a single file. Requires an unlocked vault (the
 * passphrase recovers the file's CEK). Returns the shareable URL (with the share
 * key in the #fragment), the share token, and the base64 share key.
 *
 * Throws when the vault is locked, the file predates envelope encryption
 * (no wrapped_cek), or the share request fails.
 */
export async function createFileShareLink(
  fileId: string,
  opts: FileShareOptions = {},
): Promise<{ url: string; token: string; shareKey: string }> {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) {
    throw new Error(tr("l10n.err.passphraseLocked"));
  }

  // 1. Recover this file's CEK using the owner's passphrase.
  const { meta, cek } = await prepareFileKey(fileId, await resolveFilePasswordGlobal(fileId));

  // 2. Wrap the CEK under a fresh random share key.
  const shareKey = generateCEK();
  const shareWrappedCek = await wrapKey(toArrayBuffer(shareKey), cek);
  const name = await sealFileNameForLink(meta, await userNameKey(), await keyFromBytes(shareKey));

  // 3. Create the share storing only the share-wrapped CEK. The share key never
  //    leaves the browser except in the URL fragment below.
  const result = await createShare({
    file_id: fileId,
    wrapped_cek: toBase64(shareWrappedCek),
    name,
    password: opts.password || undefined,
    expires_in_hours: opts.expiresHours || undefined,
    max_downloads: opts.maxDownloads || undefined,
  });

  const shareKeyB64 = toBase64(shareKey);
  const url = `${window.location.origin}/s/${result.token}#key=${shareKeyB64}`;

  // Refresh the shared cache so the modal + details drawer show the new link.
  void invalidateShares(fileId);

  return { url, token: result.token, shareKey: shareKeyB64 };
}
