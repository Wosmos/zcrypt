/**
 * Public-key backup format (`pk1`), docs/CRYPTO_FORMAT.md §2.2.
 *
 * Automatic backup (desktop folders, phone photos) runs with the vault locked
 * and seals each file's key and name to the account's X25519 public key, so
 * the backup device can add files but never read the vault. This module reads
 * those values with the account private key, which is loaded only while the
 * vault is unlocked, and derives the `cek_hmac_v1` integrity key.
 */
import { openSealed } from "@/lib/keys";

export const PK1_PREFIX = "pk1:";
export const CEK_MAC_SCHEME = "cek_hmac_v1";
const CEK_MAC_INFO = new TextEncoder().encode("zcrypt-cek-mac-v1");

export function isPk1(value: string | null | undefined): value is string {
  return !!value && value.startsWith(PK1_PREFIX);
}

/** Opens a pk1 value with the account private key. Throws while locked. */
export function openPk1(value: string): Promise<Uint8Array> {
  return openSealed(value.slice(PK1_PREFIX.length));
}

/** Opens a pk1-sealed name. */
export async function openPk1Name(value: string): Promise<string> {
  return new TextDecoder().decode(await openPk1(value));
}

/** HKDF-SHA256(CEK, salt empty, info "zcrypt-cek-mac-v1"): the HMAC key for
 *  a backup file's `cek_hmac_v1` content MAC. */
export async function cekMacKey(cek: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", cek as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: CEK_MAC_INFO },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}
