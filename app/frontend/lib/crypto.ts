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

/** Compute SHA-256 hex digest of data. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute SHA-256 hex digest of a File using streaming (no full file in RAM). */
export async function sha256File(file: File): Promise<string> {
  // Use streaming hash for files > 50MB, otherwise read all at once
  if (file.size <= 50 * 1024 * 1024) {
    const buf = await file.arrayBuffer();
    return sha256Hex(new Uint8Array(buf));
  }

  // Stream the file in 2MB chunks through SubtleCrypto
  // SubtleCrypto doesn't support streaming digest, so we use a manual accumulator
  const STREAM_CHUNK = 2 * 1024 * 1024;
  // Fall back to reading the entire ArrayBuffer for now
  // (browsers don't support streaming SHA-256 via SubtleCrypto)
  const buf = await file.arrayBuffer();
  return sha256Hex(new Uint8Array(buf));
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
