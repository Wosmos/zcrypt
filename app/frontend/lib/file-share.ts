/**
 * Public single-file link (zero-knowledge). Mirrors lib/folder-share.ts: recover
 * the file's CEK with the vault passphrase, re-wrap it under a fresh random share
 * key, and create the share storing only that share-wrapped envelope. The share
 * key lives only in the returned URL #fragment and never reaches the server — so
 * anyone with the link can decrypt, no account needed.
 *
 * Single home for the copy-pasted file-share crypto flow (previously duplicated
 * in the details drawer and the share modal). Callers keep their own form state,
 * toasts, and cache refresh — this just performs the crypto + create + URL build,
 * plus the shares-cache invalidation so the drawer/modal reflect the new link.
 */
import { resolveFileKey, generateCEK, wrapKey, fromBase64, toBase64, toArrayBuffer } from "@/lib/crypto";
import { getFileMeta, createShare } from "@/lib/api";
import { invalidateShares } from "@/hooks/useShares";
import { usePassphraseStore } from "@/store/passphrase";

export interface FileShareOptions {
  password?: string;
  expiresHours?: number;
  maxDownloads?: number;
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
  opts: FileShareOptions = {}
): Promise<{ url: string; token: string; shareKey: string }> {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) {
    throw new Error(
      "Your passphrase is locked. Open or download a file first to unlock it, then try sharing again."
    );
  }

  // 1. Recover this file's CEK using the owner's passphrase.
  const meta = await getFileMeta(fileId);
  if (!meta.wrapped_cek) {
    throw new Error("This file was uploaded before sharing was supported. Re-upload it to share.");
  }
  const cekBuf = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
  const cek = new Uint8Array(cekBuf);

  // 2. Wrap the CEK under a fresh random share key.
  const shareKey = generateCEK();
  const shareWrappedCek = await wrapKey(toArrayBuffer(shareKey), cek);

  // 3. Create the share storing only the share-wrapped CEK. The share key never
  //    leaves the browser except in the URL fragment below.
  const result = await createShare({
    file_id: fileId,
    wrapped_cek: toBase64(shareWrappedCek),
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
