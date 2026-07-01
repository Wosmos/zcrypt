/**
 * Public folder link (zero-knowledge). Mirrors the single-file share: one random
 * folder-share key is generated in the browser and each file's CEK is re-wrapped
 * under it. The key lives only in the returned URL #fragment and never reaches
 * the server — so anyone with the link can open the folder, no account needed,
 * while the server only ever stores opaque per-file envelopes.
 */
import { generateCEK, resolveFileKey, wrapKey, toBase64, fromBase64 } from "@/lib/crypto";
import { createFolderShare, getFileMeta } from "@/lib/api";
import { usePassphraseStore } from "@/store/passphrase";

export interface FolderShareOptions {
  password?: string;
  expiresHours?: number;
  maxDownloads?: number;
}

/**
 * Create a public link for a folder's files. `files` is the set of files to
 * include (the caller gathers the folder's subtree). Files whose CEK can't be
 * recovered with the vault passphrase (legacy files, or files inside a
 * password-protected folder) are skipped. Returns the shareable URL (key in the
 * fragment) plus how many files were shared vs. skipped. Requires an unlocked vault.
 */
export async function createFolderShareLink(
  folderId: string | null,
  name: string,
  files: { id: string }[],
  opts: FolderShareOptions = {}
): Promise<{ url: string; token: string; shared: number; skipped: number }> {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) throw new Error("Unlock your vault to share a folder.");
  if (files.length === 0) throw new Error("This folder has no files to share.");

  const folderKey = generateCEK();
  const folderKeyBuf = folderKey.buffer.slice(0) as ArrayBuffer;

  const wraps: { file_id: string; wrapped_cek: string }[] = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const meta = await getFileMeta(f.id);
      if (!meta.wrapped_cek) {
        skipped++; // legacy file (no envelope) — can't be link-shared
        continue;
      }
      // Recover the file's CEK with the owner's passphrase, then re-wrap it under
      // the folder-share key so a recipient can decrypt with just the link.
      const cekBuf = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
      const wrapped = await wrapKey(folderKeyBuf, new Uint8Array(cekBuf));
      wraps.push({ file_id: f.id, wrapped_cek: toBase64(wrapped) });
    } catch {
      skipped++; // e.g. protected-folder file whose CEK is under the folder password
    }
  }
  if (wraps.length === 0) {
    throw new Error(
      "None of this folder's files could be shared — they may be in a password-protected folder, or were uploaded before sharing was supported."
    );
  }

  const { token } = await createFolderShare({
    folder_id: folderId ?? undefined,
    name,
    files: wraps,
    password: opts.password || undefined,
    expires_in_hours: opts.expiresHours || undefined,
    max_downloads: opts.maxDownloads || undefined,
  });

  const url = `${window.location.origin}/f/${token}#key=${toBase64(folderKey)}`;
  return { url, token, shared: wraps.length, skipped };
}
