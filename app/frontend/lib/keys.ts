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
