/**
 * Per-folder password crypto helpers (zero-knowledge).
 *
 * A protected folder reuses the EXISTING per-file envelope primitive (random CEK
 * wrapped by a PBKDF2-derived KEK from `lib/crypto.ts`). The ONLY thing that
 * differs for a protected folder's files is WHICH password derives the KEK — the
 * folder password instead of the vault passphrase. There is NO new cipher and NO
 * new key-derivation here: every function below is a thin composition of the
 * existing primitives.
 *
 * The folder password NEVER leaves the device, is NEVER sent to the server, and
 * is NEVER logged. The server only ever stores opaque base64 blobs (`pw_salt`,
 * `pw_verifier`, and per-file `wrapped_cek`s).
 */

import {
  generateSalt,
  deriveKeyBytes,
  encryptChunk,
  decryptChunk,
  wrapKey,
  toBase64,
  fromBase64,
} from "@/lib/crypto";

/**
 * Constant plaintext sealed under the folder-password-derived KEK to form the
 * verifier. Versioned so the scheme can evolve without ambiguity. Must match the
 * value the spec documents; changing it would invalidate existing verifiers.
 */
const FOLDER_VERIFY_CONSTANT = "zcrypt-folder-verify-v1";

const verifyConstantBytes = (): Uint8Array =>
  new TextEncoder().encode(FOLDER_VERIFY_CONSTANT);

/**
 * Generate a fresh, random 32-byte salt for a folder's password verifier,
 * base64-encoded for transport/storage. Per-folder; used ONLY for the verifier
 * (per-file salts are unchanged and independent).
 */
export function deriveFolderPwSalt(): string {
  return toBase64(generateSalt());
}

/**
 * Build a folder-password verifier from a typed password + that folder's
 * `pw_salt` (base64). Derives `KEK_pw = deriveKeyBytes(password, pw_salt)` and
 * seals the version constant under it. The returned base64 is stored opaquely as
 * `pw_verifier`; the server can never recover the password from it.
 */
export async function makeFolderVerifier(
  password: string,
  pwSalt: string
): Promise<string> {
  const kek = await deriveKeyBytes(password, fromBase64(pwSalt));
  const sealed = await encryptChunk(kek, verifyConstantBytes());
  return toBase64(sealed);
}

/**
 * Verify a typed folder password against the stored `pw_salt` + `pw_verifier`
 * (both base64) — entirely client-side, no server round-trip and no need to
 * decrypt any real file. Derives the KEK, decrypts the verifier, and checks the
 * plaintext equals the version constant. A wrong password derives the wrong KEK,
 * so AES-GCM authentication fails and we return `false` (never throw).
 */
export async function verifyFolderPassword(
  password: string,
  pwSalt: string,
  pwVerifier: string
): Promise<boolean> {
  const kek = await deriveKeyBytes(password, fromBase64(pwSalt));
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptChunk(kek, fromBase64(pwVerifier));
  } catch {
    // Wrong password ⇒ wrong KEK ⇒ AES-GCM auth failure.
    return false;
  }
  const expected = verifyConstantBytes();
  if (plaintext.length !== expected.length) return false;
  // Length-checked byte compare. Not constant-time, but the verifier value is
  // not a secret — the password it gates already had to derive a valid KEK.
  for (let i = 0; i < expected.length; i++) {
    if (plaintext[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * Re-wrap an already-recovered CEK under a new password + new per-file salt,
 * producing the base64 `wrapped_cek` to persist via `rekeyFile`. Used when a
 * file crosses a protection boundary (protect/unprotect a folder, or move a file
 * between protection zones).
 *
 * IMPORTANT: this does NOT generate a new CEK — the caller must first recover the
 * EXISTING CEK (via `resolveFileKey` under the SOURCE password) so the file's
 * already-uploaded chunks stay decryptable. This helper only changes the KEK that
 * wraps that CEK. Returns `{ salt, wrapped_cek }` (both base64) ready for
 * `rekeyFile`. The salt MUST be the same one fed to `newSalt` so the server's
 * stored salt matches the KEK used here.
 */
export async function rewrapFileKey(
  cek: Uint8Array,
  newPassword: string,
  newSalt: Uint8Array
): Promise<{ salt: string; wrapped_cek: string }> {
  const newKek = await deriveKeyBytes(newPassword, newSalt);
  const wrapped = await wrapKey(newKek, cek);
  return { salt: toBase64(newSalt), wrapped_cek: toBase64(wrapped) };
}
