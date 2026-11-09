/**
 * Recovery kit: the vault passphrase sealed under a random 256-bit recovery
 * key that only the user holds. The server stores the sealed blob and never the
 * key, so it cannot recover anything either.
 *
 * Key text:  "ZCRYPT-" + 13 groups of 4 Crockford base32 chars (the 32 key
 *            bytes) + 1 check group (first 4 chars of base32(SHA-256(key))),
 *            all groups separated by "-".
 * Blob:      "rk1:" + base64(AES-256-GCM(HKDF-SHA256(key, "", "zcrypt-recovery-v1"),
 *            utf8(passphrase))) in the standard [12B IV || ciphertext || 16B tag] layout.
 */
import { decryptChunk, encryptChunk, fromBase64, toBase64 } from "@/lib/crypto";

export const RECOVERY_KEY_BYTES = 32;
export const RECOVERY_PREFIX = "ZCRYPT";
export const RECOVERY_BLOB_PREFIX = "rk1:";
const HKDF_INFO = "zcrypt-recovery-v1";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_CHARS = 52;
const CHECK_CHARS = 4;

export type RecoveryKeyErrorCode = "length" | "chars" | "typo" | "wrong" | "blob";

/** A recovery key or blob problem, carried as a code so the UI can localise it. */
export class RecoveryKeyError extends Error {
  readonly code: RecoveryKeyErrorCode;
  constructor(code: RecoveryKeyErrorCode) {
    super(`recovery key: ${code}`);
    this.name = "RecoveryKeyError";
    this.code = code;
  }
}

/** A fresh random recovery key. */
export function generateRecoveryKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_BYTES));
}

function encodeBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  /* v8 ignore start -- every input here is 32 bytes, which always leaves bits over */
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  /* v8 ignore stop */
  return out;
}

function decodeBase32(text: string, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let bits = 0;
  let acc = 0;
  let index = 0;
  for (const ch of text) {
    acc = (acc << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out[index] = (acc >>> (bits - 8)) & 255;
      index += 1;
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

async function checkGroup(key: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", key as BufferSource);
  return encodeBase32(new Uint8Array(digest)).slice(0, CHECK_CHARS);
}

/** The key as shown to the user: ZCRYPT-XXXX-...-CCCC. */
export async function formatRecoveryKey(key: Uint8Array): Promise<string> {
  const chars = encodeBase32(key) + (await checkGroup(key));
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += 4) groups.push(chars.slice(i, i + 4));
  return [RECOVERY_PREFIX, ...groups].join("-");
}

/** The last 4 characters of the key as shown (its check group). */
export function recoveryKeyTail(formatted: string): string {
  return formatted.slice(-CHECK_CHARS);
}

/**
 * Parse what a user typed or pasted back into key bytes. Case, spaces and
 * hyphens are ignored, I and L read as 1, O reads as 0 (Crockford). Throws a
 * RecoveryKeyError("typo") when the check group does not match, before any
 * network call is made.
 */
export async function parseRecoveryKey(input: string): Promise<Uint8Array> {
  let text = input.toUpperCase().replace(/[\s-]+/g, "");
  if (text.length === RECOVERY_PREFIX.length + BODY_CHARS + CHECK_CHARS) {
    if (!text.startsWith(RECOVERY_PREFIX)) throw new RecoveryKeyError("chars");
    text = text.slice(RECOVERY_PREFIX.length);
  }
  if (text.length !== BODY_CHARS + CHECK_CHARS) throw new RecoveryKeyError("length");
  text = text.replace(/[IL]/g, "1").replace(/O/g, "0");
  for (const ch of text) {
    if (!ALPHABET.includes(ch)) throw new RecoveryKeyError("chars");
  }
  const key = decodeBase32(text.slice(0, BODY_CHARS), RECOVERY_KEY_BYTES);
  if ((await checkGroup(key)) !== text.slice(BODY_CHARS)) throw new RecoveryKeyError("typo");
  return key;
}

async function deriveSealKey(key: Uint8Array): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey("raw", key as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    material,
    256,
  );
}

/** Seal the vault passphrase under the recovery key. */
export async function sealRecoveryBlob(key: Uint8Array, passphrase: string): Promise<string> {
  const sealKey = await deriveSealKey(key);
  const sealed = await encryptChunk(sealKey, new TextEncoder().encode(passphrase));
  return RECOVERY_BLOB_PREFIX + toBase64(sealed);
}

/** Recover the passphrase. Throws RecoveryKeyError("wrong") for the wrong key. */
export async function openRecoveryBlob(key: Uint8Array, blob: string): Promise<string> {
  if (!blob.startsWith(RECOVERY_BLOB_PREFIX)) throw new RecoveryKeyError("blob");
  let sealed: Uint8Array;
  try {
    sealed = fromBase64(blob.slice(RECOVERY_BLOB_PREFIX.length));
  } catch {
    throw new RecoveryKeyError("blob");
  }
  try {
    const plain = await decryptChunk(await deriveSealKey(key), sealed);
    return new TextDecoder().decode(plain);
  } catch {
    throw new RecoveryKeyError("wrong");
  }
}
