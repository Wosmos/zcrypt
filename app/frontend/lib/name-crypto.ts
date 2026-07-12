/**
 * Client-side encryption for folder + file NAMES (zero-knowledge metadata).
 *
 * Mirrors the Secure Notes pattern exactly (see app/(app)/notes/page.tsx):
 * a per-user deterministic salt ("zcrypt-names-<userId>") + PBKDF2 (via
 * deriveKeyBytes) -> AES-256-GCM. Ciphertext is base64 of [12B IV || ciphertext+tag].
 *
 * The server stores only this opaque base64 in `encrypted_name` and never sees
 * the plaintext name. Names therefore require the vault passphrase to read,
 * exactly like note titles/bodies.
 */

import { deriveKeyBytes, toBase64, fromBase64 } from "@/lib/crypto";

/** Derive the AES-GCM key used to encrypt/decrypt names for a given user. */
export async function deriveNameKey(passphrase: string, userId: string): Promise<CryptoKey> {
  const salt = new TextEncoder().encode("zcrypt-names-" + userId);
  const keyBytes = await deriveKeyBytes(passphrase, salt);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt a name to base64 [iv || ciphertext+tag]. */
export async function encryptName(name: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(name));
  const combined = new Uint8Array(iv.length + new Uint8Array(enc).length);
  combined.set(iv);
  combined.set(new Uint8Array(enc), iv.length);
  return toBase64(combined);
}

/** Decrypt a base64 [iv || ciphertext+tag] name. Throws on wrong key / corruption. */
export async function decryptName(b64: string, key: CryptoKey): Promise<string> {
  const data = fromBase64(b64);
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(dec);
}

/** Decrypt a name, returning a safe placeholder instead of throwing. */
export async function decryptNameSafe(b64: string, key: CryptoKey): Promise<string> {
  try {
    return await decryptName(b64, key);
  } catch {
    return "[locked]";
  }
}

/** A folder/file's custom card appearance (icon key + raw hex color and/or a
 *  curated background design key), encrypted client-side via the same
 *  per-user name key — the server only ever sees the opaque `encrypted_style`
 *  base64 blob. `color` and `background` are mutually exclusive at the UI
 *  level (solid vs. design mode), but both fields are kept so older data
 *  saved with only `color` set keeps rendering exactly as before. */
export interface CustomStyle {
  icon?: string;
  color?: string;
  background?: string;
}

/** Encrypt a CustomStyle to the same base64 [iv || ciphertext+tag] shape as a name. */
export async function encryptStyle(style: CustomStyle, key: CryptoKey): Promise<string> {
  return encryptName(JSON.stringify(style), key);
}

/** Decrypt a CustomStyle. Returns null for null/undefined/empty input and on any
 *  decrypt/parse failure — a corrupt style blob should never break rendering. */
export async function decryptStyle(
  b64: string | null | undefined,
  key: CryptoKey
): Promise<CustomStyle | null> {
  if (!b64) return null;
  try {
    const parsed = JSON.parse(await decryptName(b64, key));
    return parsed && typeof parsed === "object" ? (parsed as CustomStyle) : null;
  } catch {
    return null;
  }
}
