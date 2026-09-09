import type { FileMetadata } from "@/types";
import { encryptName, decryptNameSafe, decryptStyle } from "@/lib/name-crypto";
import { userNameKey } from "@/lib/sealed";
import { setFileName } from "@/lib/api";

/**
 * Zero-knowledge file-name dual-read.
 *
 * A file's name lives in one of two columns: legacy files carry a plaintext
 * `original_name` (encrypted_name == ""); zero-knowledge files carry an opaque
 * `encrypted_name` and an empty `original_name`. Every display/sort/search site
 * reads `original_name`, so we resolve it ONCE here — at the query source — into
 * the real name (decrypted with the per-user name key) or a "[locked]" placeholder
 * when the vault is locked. Legacy files pass through unchanged.
 *
 * Mirrors the folder-name pattern (useFolders): the server only ever stores the
 * opaque ciphertext; the plaintext exists only in the browser while unlocked.
 */
// Legacy files are re-sealed the first time they're listed while the vault is
// unlocked: the plaintext name is encrypted under the name key and handed back
// to the server, which blanks its plaintext copies. Once per file per session;
// display isn't blocked on it.
const resealed = new Set<string>();
function resealLegacyName(f: FileMetadata, key: CryptoKey) {
  if (resealed.has(f.id)) return;
  resealed.add(f.id);
  encryptName(f.original_name, key)
    .then((enc) => setFileName(f.id, enc))
    .catch(() => resealed.delete(f.id)); // transient failure → retry on a later list
}

export async function decryptFileNames(files: FileMetadata[]): Promise<FileMetadata[]> {
  if (files.length === 0) return files;
  const key = await userNameKey(); // null while locked — no derivation happens

  // Fast path: nothing to decrypt. Legacy names display as-is; while unlocked
  // they're also queued for re-sealing so the server can drop its plaintext.
  if (!files.some((f) => f.encrypted_name || f.encrypted_style)) {
    if (key) for (const f of files) if (f.original_name) resealLegacyName(f, key);
    return files;
  }

  return Promise.all(
    files.map(async (f) => {
      if (!f.encrypted_name && !f.encrypted_style) {
        if (key && f.original_name) resealLegacyName(f, key); // legacy plaintext → seal it
        return f;
      }
      return {
        ...f,
        original_name: f.encrypted_name
          ? key
            ? await decryptNameSafe(f.encrypted_name, key)
            : "[locked]"
          : f.original_name,
        style: key ? await decryptStyle(f.encrypted_style, key) : null,
      };
    }),
  );
}
