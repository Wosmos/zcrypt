/**
 * Sealed metadata — zero-knowledge for everything that ISN'T a file body.
 *
 * File and folder names already travel as opaque ciphertext (`encrypted_name`).
 * The smaller labels around them — timed-vault names, snapshot labels, sync-folder
 * paths, decoy filenames, Send / folder-share display names — were still plaintext
 * in the database. They now reuse the exact same AES-GCM primitive (name-crypto)
 * and ride in their EXISTING columns behind a self-describing `enc1:` prefix, so
 * the server needs no schema change and treats the value as an opaque string.
 * Legacy plaintext rows pass through unchanged (no prefix ⇒ not sealed).
 */

import { deriveNameKey, encryptName, decryptNameSafe } from "@/lib/name-crypto";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";

export const SEALED_PREFIX = "enc1:";
export const LOCKED = "[locked]";

export function isSealed(s: string | null | undefined): s is string {
  return typeof s === "string" && s.startsWith(SEALED_PREFIX);
}

export async function sealText(text: string, key: CryptoKey): Promise<string> {
  return SEALED_PREFIX + (await encryptName(text, key));
}

/** Legacy plaintext passes through; sealed without a key reads as LOCKED. */
export async function openText(s: string, key: CryptoKey | null): Promise<string> {
  if (!isSealed(s)) return s;
  if (!key) return LOCKED;
  return decryptNameSafe(s.slice(SEALED_PREFIX.length), key);
}

/** Open several string fields on every item; a no-op when nothing is sealed. */
export async function openFields<T extends object>(
  items: T[],
  fields: (keyof T)[],
  key: CryptoKey | null,
): Promise<T[]> {
  if (!items.some((it) => fields.some((f) => isSealed(it[f] as unknown as string)))) return items;
  return Promise.all(
    items.map(async (it) => {
      const out = { ...it };
      for (const f of fields) {
        const v = it[f];
        if (typeof v === "string") (out as Record<keyof T, unknown>)[f] = await openText(v, key);
      }
      return out;
    }),
  );
}

// PBKDF2 is deliberately slow; remember the last derived key per (passphrase, user).
let memo: { passphrase: string; userId: string; key: Promise<CryptoKey> } | null = null;

/** The signed-in user's name key, or null while the vault is locked. */
export function userNameKey(): Promise<CryptoKey | null> {
  const user = useAuthStore.getState().user;
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!user || !passphrase) return Promise.resolve(null);
  if (!memo || memo.passphrase !== passphrase || memo.userId !== user.id) {
    memo = { passphrase, userId: user.id, key: deriveNameKey(passphrase, user.id) };
  }
  return memo.key;
}

/** Like userNameKey, but refuses to proceed unsealed — writes must never leak plaintext. */
export async function requireNameKey(): Promise<CryptoKey> {
  const key = await userNameKey();
  if (!key)
    throw new Error("Unlock your vault first — this name is encrypted with your passphrase.");
  return key;
}

/** Import raw AES-256 key bytes (a Send link key, a folder-share key) for sealing. */
export function keyFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const buf =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : bytes;
  return crypto.subtle.importKey("raw", buf, "AES-GCM", false, ["encrypt", "decrypt"]);
}
