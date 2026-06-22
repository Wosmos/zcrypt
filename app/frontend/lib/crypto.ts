/**
 * Client-side cryptographic utilities for zero-knowledge encryption.
 *
 * Uses Web Crypto API:
 * - PBKDF2-SHA256 (600k iterations) for key derivation
 * - AES-256-GCM for per-chunk encryption
 * - SHA-256 for integrity verification
 *
 * Chunk wire format: [12B IV][ciphertext][16B auth tag]
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_SIZE = 32;
const IV_SIZE = 12;
const KEY_SIZE = 32; // 256 bits

/** Generate a 32-byte random salt. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_SIZE));
}

/** Derive a 256-bit key from passphrase + salt using PBKDF2-SHA256.
 *  Returns raw ArrayBuffer (transferable to workers). */
export async function deriveKeyBytes(
  passphrase: string,
  salt: Uint8Array
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    KEY_SIZE * 8
  );
}

/** Encrypt a chunk. Returns [12B IV || ciphertext || 16B tag]. */
export async function encryptChunk(
  keyBytes: ArrayBuffer,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  // Combine: IV + ciphertext (includes 16-byte auth tag appended by AES-GCM)
  const result = new Uint8Array(IV_SIZE + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_SIZE);
  return result;
}

/** Decrypt a chunk. Input: [12B IV || ciphertext || 16B tag]. */
export async function decryptChunk(
  keyBytes: ArrayBuffer,
  data: Uint8Array
): Promise<Uint8Array> {
  const iv = data.slice(0, IV_SIZE);
  const ciphertext = data.slice(IV_SIZE);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return new Uint8Array(plaintext);
}

/**
 * Envelope encryption helpers.
 *
 * Each file is encrypted with a random Content Encryption Key (CEK), NOT with
 * the passphrase-derived key directly. The CEK is then "wrapped" (encrypted)
 * with a Key Encryption Key (KEK): the passphrase-derived key for the owner, or
 * a random share key for a share link. This lets a file be decrypted by anyone
 * holding a wrapped copy of its CEK, without ever revealing the owner's
 * passphrase — the foundation for zero-knowledge sharing.
 *
 * The wrapped CEK reuses the chunk wire format: [12B IV || ciphertext || 16B tag].
 */

/** Generate a random 256-bit Content Encryption Key (CEK). */
export function generateCEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_SIZE));
}

/** Wrap (encrypt) a CEK under a KEK. Returns [12B IV || ciphertext || 16B tag]. */
export async function wrapKey(
  kekBytes: ArrayBuffer,
  cek: Uint8Array
): Promise<Uint8Array> {
  return encryptChunk(kekBytes, cek);
}

/** Unwrap (decrypt) a CEK that was wrapped under a KEK. */
export async function unwrapKey(
  kekBytes: ArrayBuffer,
  wrapped: Uint8Array
): Promise<Uint8Array> {
  return decryptChunk(kekBytes, wrapped);
}

/**
 * Thrown when a file key can't be resolved because the passphrase is wrong.
 *
 * For envelope files, an incorrect passphrase derives the wrong KEK, so unwrapping
 * the CEK fails AES-GCM authentication — Web Crypto surfaces that as a bare
 * `DOMException("OperationError")`, which is NOT `instanceof Error`, so callers that
 * do `err instanceof Error ? err.message : "…"` silently lose the reason. Re-throwing
 * this typed Error gives every download path a clear, surfaceable "wrong passphrase".
 */
export class IncorrectPassphraseError extends Error {
  constructor() {
    super("Incorrect passphrase — could not unlock this file.");
    this.name = "IncorrectPassphraseError";
  }
}

/**
 * Resolve the key used to decrypt a file's chunks, from the owner's passphrase.
 *
 * Envelope (v2) files carry a base64 `wrappedCek`: derive the KEK from the
 * passphrase + salt, unwrap it to recover the per-file CEK, and return the CEK.
 * Legacy files (no wrappedCek) were encrypted directly with the
 * passphrase-derived key, so that key is returned as-is.
 *
 * Returns a raw ArrayBuffer suitable for decryptChunk / worker transfer.
 * Throws IncorrectPassphraseError when an envelope file's CEK can't be unwrapped.
 */
export async function resolveFileKey(
  passphrase: string,
  salt: Uint8Array,
  wrappedCek?: string | null
): Promise<ArrayBuffer> {
  const kek = await deriveKeyBytes(passphrase, salt);
  if (!wrappedCek) {
    return kek; // legacy: passphrase-derived key encrypts content directly
  }
  let cek: Uint8Array;
  try {
    cek = await unwrapKey(kek, fromBase64(wrappedCek));
  } catch {
    // Unwrap failed AES-GCM auth: the KEK (from the passphrase) is wrong.
    throw new IncorrectPassphraseError();
  }
  return cek.buffer.slice(0) as ArrayBuffer;
}

/** Compute SHA-256 hex digest of data. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute SHA-256 hex digest of a File using streaming (constant ~4MB RAM). */
export async function sha256File(file: File): Promise<string> {
  // Small files: read all at once (fast path)
  if (file.size <= 50 * 1024 * 1024) {
    const buf = await file.arrayBuffer();
    return sha256Hex(new Uint8Array(buf));
  }

  // Large files: stream in 4MB chunks using @noble/hashes (incremental updates)
  const { sha256: nobleSha256 } = await import("@noble/hashes/sha2.js");
  const hasher = nobleSha256.create();
  const STREAM_CHUNK = 4 * 1024 * 1024;

  for (let offset = 0; offset < file.size; offset += STREAM_CHUNK) {
    const slice = file.slice(offset, Math.min(offset + STREAM_CHUNK, file.size));
    const buf = await slice.arrayBuffer();
    hasher.update(new Uint8Array(buf));
  }

  const hash = hasher.digest();
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Encode bytes to base64 string. */
export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/** Decode base64 string to bytes. */
export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
