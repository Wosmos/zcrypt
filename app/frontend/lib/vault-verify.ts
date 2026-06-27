import { listFiles, getFileMeta } from "@/lib/api";
import { resolveFileKey, fromBase64, IncorrectPassphraseError } from "@/lib/crypto";

/**
 * Verify a typed vault passphrase WITHOUT a stored verifier, by reusing an
 * existing file's envelope as the test: derive the KEK from the passphrase + that
 * file's salt and try to unwrap its `wrapped_cek`. A wrong passphrase derives the
 * wrong KEK, so AES-GCM authentication fails (surfaced as IncorrectPassphraseError)
 * — exactly the same check `resolveFileKey` already does at decrypt time, just run
 * up front so the unlock modal can reject a bad passphrase instead of caching it.
 *
 * Returns:
 *  - `false` → the passphrase is DEFINITIVELY wrong (a real file's CEK won't unwrap).
 *  - `true`  → verified correct, OR the check is inconclusive (empty vault, only
 *              legacy non-envelope files, or a transient API error). We never block
 *              unlocking on an inconclusive result — a genuinely wrong passphrase
 *              still fails later at decrypt time, so the worst case is the previous
 *              behavior, never a false "wrong passphrase".
 *
 * Zero-knowledge: the passphrase never leaves the device; this only reads file
 * metadata the client already fetches in order to decrypt.
 */
export async function verifyVaultPassphrase(passphrase: string): Promise<boolean> {
  let files;
  try {
    files = await listFiles();
  } catch {
    return true; // couldn't list files — inconclusive, don't block the user
  }
  if (!files.length) return true; // empty vault — nothing to verify against yet

  // Probe a few files until one has an envelope CEK we can test against. Most
  // files are envelope (v2); legacy files (no wrapped_cek) can't be unwrap-tested.
  for (const file of files.slice(0, 5)) {
    try {
      const meta = await getFileMeta(file.id);
      if (!meta.wrapped_cek) continue; // legacy file — skip, not verifiable this way
      // Throws IncorrectPassphraseError iff the passphrase is wrong.
      await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
      return true; // unwrap succeeded → passphrase is correct
    } catch (err) {
      if (err instanceof IncorrectPassphraseError) return false; // definitively wrong
      // Any other error (network / odd file) — try the next candidate.
    }
  }
  return true; // couldn't conclusively check any file — don't block unlock
}
