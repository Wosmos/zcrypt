/**
 * Per-user X25519 keypair management for zero-knowledge sharing.
 *
 * The keypair is generated client-side. The private key is wrapped (encrypted)
 * under the user's passphrase-derived key using the SAME envelope primitives as
 * file CEKs (PBKDF2 → AES-256-GCM via lib/crypto), so the server only ever
 * stores ciphertext it cannot read. The public key + a short fingerprint are
 * stored in the clear for others to wrap shared-space keys to.
 *
 * The asymmetric "seal a space key to a recipient's public key" step (ECDH
 * key-wrapping) belongs to the sharing phase (P2); this module only manages the
 * identity keypair.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import {
  deriveKeyBytes,
  wrapKey,
  unwrapKey,
  generateSalt,
  toBase64,
  fromBase64,
  sha256Hex,
} from "@/lib/crypto";
import { getMyKey, publishKey } from "@/lib/api";
import { useKeysStore } from "@/store/keys";

/** Short, human-verifiable fingerprint of a public key (first 16 hex chars of
 *  its SHA-256, grouped) — for out-of-band verification against a MITM. */
export async function keyFingerprint(publicKey: Uint8Array): Promise<string> {
  const hex = await sha256Hex(publicKey);
  return (hex.slice(0, 16).toUpperCase().match(/.{4}/g) ?? []).join("-");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Derive a symmetric AES key from an ECDH shared secret. We never use the raw
// X25519 output directly — hash it, binding both public keys to the key so a
// sealed blob is tied to this exact (ephemeral, recipient) pair.
async function deriveSealKey(
  shared: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientPub: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.digest(
    "SHA-256",
    concatBytes(shared, ephemeralPub, recipientPub) as BufferSource
  );
}

/** A fresh random 256-bit symmetric key for a shared space. */
export function generateSpaceKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Seal `data` (e.g. a space key) to a recipient's X25519 public key using an
 * ECIES construction: an ephemeral X25519 keypair does ECDH with the
 * recipient, the shared secret is hashed into an AES-256-GCM key, and the
 * ephemeral public key is prepended so the recipient can reconstruct it. Only
 * the recipient's private key can open it — the server never can.
 *
 * Layout (base64): ephemeralPublicKey[32] || AES-GCM([12B IV || ct || 16B tag]).
 */
export async function sealTo(recipientPublicKey: Uint8Array, data: Uint8Array): Promise<string> {
  const eph = x25519.keygen();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientPublicKey);
  const aesKey = await deriveSealKey(shared, eph.publicKey, recipientPublicKey);
  const wrapped = await wrapKey(aesKey, data);
  return toBase64(concatBytes(eph.publicKey, wrapped));
}

/**
 * Open a blob sealed to the current user, using the session private key.
 * Throws if the keypair isn't loaded or the blob wasn't sealed to us.
 */
export async function openSealed(sealed: string): Promise<Uint8Array> {
  const { privateKey, publicKey } = useKeysStore.getState();
  if (!privateKey || !publicKey) throw new Error("keypair not loaded");
  const raw = fromBase64(sealed);
  const ephemeralPub = raw.slice(0, 32);
  const wrapped = raw.slice(32);
  const shared = x25519.getSharedSecret(privateKey, ephemeralPub);
  const aesKey = await deriveSealKey(shared, ephemeralPub, publicKey);
  return unwrapKey(aesKey, wrapped);
}

/**
 * Ensure the user has an X25519 keypair loaded into the session store: fetch +
 * unwrap it if already published, otherwise generate + publish one. Idempotent
 * per session (guarded by the store). Never throws — if it fails, sharing is
 * simply unavailable until it succeeds, and the rest of the app is unaffected.
 */
export async function ensureUserKeypair(passphrase: string): Promise<void> {
  const s = useKeysStore.getState();
  if (s.ready || s.loading || !passphrase) return;
  useKeysStore.setState({ loading: true });
  try {
    const existing = await getMyKey();
    if (existing) {
      const kek = await deriveKeyBytes(passphrase, fromBase64(existing.kdf_salt));
      // Throws if the passphrase is wrong (GCM auth failure) — we leave the
      // store not-ready and let a later unlock retry.
      const privateKey = await unwrapKey(kek, fromBase64(existing.wrapped_private_key));
      useKeysStore.setState({
        privateKey,
        publicKey: fromBase64(existing.public_key),
        fingerprint: existing.fingerprint,
        ready: true,
        loading: false,
      });
      return;
    }

    // First time on this account: generate + publish.
    const { secretKey, publicKey } = x25519.keygen();
    const salt = generateSalt();
    const kek = await deriveKeyBytes(passphrase, salt);
    const wrapped = await wrapKey(kek, secretKey);
    const fingerprint = await keyFingerprint(publicKey);
    await publishKey({
      public_key: toBase64(publicKey),
      wrapped_private_key: toBase64(wrapped),
      kdf_salt: toBase64(salt),
      fingerprint,
    });
    useKeysStore.setState({
      privateKey: secretKey,
      publicKey,
      fingerprint,
      ready: true,
      loading: false,
    });
  } catch {
    useKeysStore.setState({ loading: false });
  }
}
