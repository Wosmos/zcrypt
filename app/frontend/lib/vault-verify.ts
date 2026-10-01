import { getFileMeta } from "@/lib/api";
import { ensureFiles } from "@/store/files";
import { resolveFileKey, fromBase64, IncorrectPassphraseError } from "@/lib/crypto";
import { useFolderRegistry } from "@/store/folder-registry";

/**
 * Verify a typed vault passphrase WITHOUT a stored verifier, by reusing an
 * existing file's envelope as the test: derive the KEK from the passphrase + that
 * file's salt and try to unwrap its `wrapped_cek`. A wrong passphrase derives the
 * wrong KEK, so AES-GCM authentication fails (surfaced as IncorrectPassphraseError)
 *: exactly the same check `resolveFileKey` already does at decrypt time, just run
 * up front so the unlock modal can reject a bad passphrase instead of caching it.
 *
 * Returns:
 *  - `false` → the passphrase is DEFINITIVELY wrong (a real file's CEK won't unwrap).
 *  - `true`  → verified correct, OR the check is inconclusive (empty vault, only
 *              legacy non-envelope files, or a transient API error). We never block
 *              unlocking on an inconclusive result: a genuinely wrong passphrase
 *              still fails later at decrypt time, so the worst case is the previous
 *              behavior, never a false "wrong passphrase".
 *
 * Zero-knowledge: the passphrase never leaves the device; this only reads file
 * metadata the client already fetches in order to decrypt.
 */
export async function verifyVaultPassphrase(passphrase: string): Promise<boolean> {
  let files;
  try {
    files = await ensureFiles();
  } catch {
    return true; // couldn't list files: inconclusive, don't block the user
  }
  if (!files.length) return true; // empty vault, nothing to verify against yet

  // Fetch a few candidates' metadata in parallel (the network is the slow part),
  // then unwrap-test the envelope ones in order. Legacy files (no wrapped_cek)
  // can't be unwrap-tested. One success is proof. A rejection is proof only for
  // a file known to sit outside a password-protected folder (such a file rejects
  // the vault passphrase without it being wrong), so each PBKDF2 derivation past
  // the first is paid only for files whose folder protection is unknown.
  const registry = useFolderRegistry.getState();
  const candidates = files
    .filter((f) => !f.folder_id || !registry.isProtected(f.folder_id))
    .sort((a, b) => Number(!!a.folder_id) - Number(!!b.folder_id))
    .slice(0, 5);
  const conclusive = (folderId: string | null | undefined) =>
    !folderId || registry.get(folderId) != null;
  const metas = await Promise.all(candidates.map((file) => getFileMeta(file.id).catch(() => null)));
  let rejected = false;
  for (const [i, meta] of metas.entries()) {
    if (!meta?.wrapped_cek) continue;
    try {
      await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
      return true; // unwrap succeeded → passphrase is correct
    } catch (err) {
      if (!(err instanceof IncorrectPassphraseError)) continue; // odd file, try the next
      if (conclusive(candidates[i].folder_id)) return false;
      rejected = true;
    }
  }
  return !rejected; // nothing conclusive either way: don't block unlock
}
