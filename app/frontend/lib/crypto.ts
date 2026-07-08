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

/**
 * Derived-key memo.
 *
 * PBKDF2 at 600k iterations costs 0.3–3s per call, and the SAME
 * (passphrase, salt) pair is re-derived for a file's thumbnail, then its
 * preview, then its download. Memoize the derived bytes so each pair pays
 * PBKDF2 exactly once per session.
 *
 * SECURITY: the cache holds raw key bytes in memory ONLY — the same exposure
 * class as the in-memory passphrase cache and the decrypt-cache plaintext. It
 * is never persisted or logged, and it is cleared on every lock event via
 * clearDerivedKeyCache() (wired into lib/decrypt-cache's clear paths). The
 * passphrase appears in the cache key, but it is already held in memory by the
 * passphrase store, so the composite string adds no new exposure.
 */
const DERIVED_KEY_CACHE_MAX = 256;
const derivedKeyCache = new Map<string, Uint8Array>();

/** Drop every memoized derived key (vault lock / TTL / logout / folder lock). */
export function clearDerivedKeyCache(): void {
  derivedKeyCache.clear();
}

/** deriveKeyBytes, memoized per (salt, passphrase) pair. Returns a FRESH
 *  ArrayBuffer copy on every call so a caller that transfers/detaches its
 *  buffer (e.g. to a worker) can never corrupt the cached bytes. */
export async function deriveKeyBytesCached(
  passphrase: string,
  salt: Uint8Array
): Promise<ArrayBuffer> {
  const cacheKey = toBase64(salt) + "|" + passphrase;
  const hit = derivedKeyCache.get(cacheKey);
  if (hit) return hit.slice().buffer as ArrayBuffer;

  const bytes = await deriveKeyBytes(passphrase, salt);
  // Cap with simple insertion-order eviction (Map iterates oldest-first). The
  // size check guarantees the map is non-empty, so the first key always exists.
  if (derivedKeyCache.size >= DERIVED_KEY_CACHE_MAX) {
    const oldest = derivedKeyCache.keys().next().value as string;
    derivedKeyCache.delete(oldest);
  }
  derivedKeyCache.set(cacheKey, new Uint8Array(bytes.slice(0)));
  return bytes;
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
  // Memoized: repeated opens of the same (passphrase, salt) pair — thumbnail,
  // then preview, then download — pay the 600k-iteration PBKDF2 only once.
  const kek = await deriveKeyBytesCached(passphrase, salt);
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

/** Lowercase hex encoding of raw bytes. The ONE hex encoder — sha256Hex,
 *  sha256File, and the content-MAC helpers below all route through it, and
 *  external hex sites (download-session, useFileDecryptor, oauth-buttons) should
 *  import it. (The crypto worker keeps its own copy — separate bundle.) */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A Uint8Array's bytes as a standalone ArrayBuffer, honoring byteOffset /
 *  byteLength (a subarray/view is copied out correctly). Use this instead of the
 *  `.buffer.slice(0)` pattern, which silently copies the WHOLE backing buffer of
 *  a view rather than just its window — a latent corruption bug for any
 *  Uint8Array that isn't a full-buffer view. */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Compute SHA-256 hex digest of data. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return bytesToHex(new Uint8Array(hash));
}

// --- Content MAC (confirmation-of-file defeat) ---
//
// The file-level content hash used for dedup/resume and integrity was SHA-256 of
// the PLAINTEXT, which let anyone with DB access confirm a user stores a known
// file. We replace it (scheme 'hmac_v1') with a per-user KEYED MAC: HMAC-SHA256
// under a passphrase-derived key with a stable per-user salt. It stays
// deterministic over (user, passphrase, content) — so single-user dedup/resume
// still matches on the stored value — but a passphrase-less attacker cannot
// compute it for a known file, and two users storing the same bytes get
// different MACs. Mirrors the name-key derivation ("zcrypt-names-<uid>").

/** Derive the per-user dedup/MAC key bytes (32B). Memoized per (salt,passphrase).
 *  deriveKeyBytesCached yields an ArrayBuffer; wrap it as a Uint8Array so noble's
 *  HMAC (and its strict byte-assert) accepts it directly. */
export async function deriveDedupKeyBytes(passphrase: string, userId: string): Promise<Uint8Array> {
  const salt = new TextEncoder().encode("zcrypt-dedup-" + userId);
  return new Uint8Array(await deriveKeyBytesCached(passphrase, salt));
}

/** HMAC-SHA256 hex of in-memory bytes under keyBytes. */
export async function contentMacBytes(data: Uint8Array, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return bytesToHex(new Uint8Array(mac));
}

/** HMAC-SHA256 hex of a File, streaming for large files (Web Crypto HMAC can't
 *  stream, so >50MB uses @noble/hashes incrementally — mirrors sha256File). */
export async function contentMacFile(file: File, keyBytes: Uint8Array, onProgress?: (bytesHashed: number) => void): Promise<string> {
  if (file.size <= 50 * 1024 * 1024) {
    const buf = await file.arrayBuffer();
    onProgress?.(file.size);
    return contentMacBytes(new Uint8Array(buf), keyBytes);
  }
  const hasher = await createContentHasher("hmac_v1", keyBytes);
  const STREAM_CHUNK = 4 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += STREAM_CHUNK) {
    const slice = file.slice(offset, Math.min(offset + STREAM_CHUNK, file.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
    onProgress?.(Math.min(offset + STREAM_CHUNK, file.size));
  }
  return bytesToHex(hasher.digest());
}

/** An incremental hasher (update/digest) matching the scheme, for the streaming
 *  download-verify path: 'hmac_v1' → keyed HMAC-SHA256, anything else → SHA-256.
 *  Feeding it the plaintext chunks in order and comparing digest() to the stored
 *  value verifies integrity for both legacy and keyed files. */
export async function createContentHasher(
  scheme: string | undefined,
  keyBytes?: Uint8Array,
): Promise<{ update: (d: Uint8Array) => void; digest: () => Uint8Array }> {
  if (scheme === "hmac_v1") {
    if (!keyBytes) throw new Error("hmac_v1 content hasher requires a key");
    const { hmac } = await import("@noble/hashes/hmac.js");
    const { sha256: nobleSha256 } = await import("@noble/hashes/sha2.js");
    const h = hmac.create(nobleSha256, keyBytes);
    return { update: (d) => h.update(d), digest: () => h.digest() };
  }
  const { sha256: nobleSha256 } = await import("@noble/hashes/sha2.js");
  const h = nobleSha256.create();
  return { update: (d) => h.update(d), digest: () => h.digest() };
}

/** Compute SHA-256 hex digest of a File using streaming (constant ~4MB RAM).
 *  `onProgress` (optional) receives cumulative bytes hashed, so a multi-GB
 *  pre-hash can show movement instead of a dead progress row. */
export async function sha256File(file: File, onProgress?: (bytesHashed: number) => void): Promise<string> {
  // Small files: read all at once (fast path)
  if (file.size <= 50 * 1024 * 1024) {
    const buf = await file.arrayBuffer();
    onProgress?.(file.size);
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
    onProgress?.(Math.min(offset + STREAM_CHUNK, file.size));
  }

  return bytesToHex(hasher.digest());
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
