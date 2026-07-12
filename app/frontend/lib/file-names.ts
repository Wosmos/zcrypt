import type { FileMetadata } from "@/types";
import { deriveNameKey, decryptNameSafe, decryptStyle } from "@/lib/name-crypto";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";

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
export async function decryptFileNames(files: FileMetadata[]): Promise<FileMetadata[]> {
  // Fast path: nothing is encrypted → return as-is (all-legacy vault).
  if (!files.some((f) => f.encrypted_name || f.encrypted_style)) return files;

  const user = useAuthStore.getState().user;
  const passphrase = usePassphraseStore.getState().getPassphrase();
  const key = user && passphrase ? await deriveNameKey(passphrase, user.id) : null;

  return Promise.all(
    files.map(async (f) => {
      if (!f.encrypted_name && !f.encrypted_style) return f; // legacy plaintext file — untouched
      return {
        ...f,
        original_name: f.encrypted_name ? (key ? await decryptNameSafe(f.encrypted_name, key) : "[locked]") : f.original_name,
        style: key ? await decryptStyle(f.encrypted_style, key) : null,
      };
    })
  );
}
