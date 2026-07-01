import { create } from "zustand";

/**
 * Session keypair store for zero-knowledge sharing. Holds the user's X25519
 * keypair in memory for the session (the private key is only decrypted from the
 * passphrase-wrapped copy while unlocked, and dropped on logout). Never
 * persisted in plaintext.
 */
interface KeysStore {
  privateKey: Uint8Array | null;
  publicKey: Uint8Array | null;
  fingerprint: string | null;
  ready: boolean;
  loading: boolean;
  reset: () => void;
}

export const useKeysStore = create<KeysStore>((set) => ({
  privateKey: null,
  publicKey: null,
  fingerprint: null,
  ready: false,
  loading: false,
  reset: () =>
    set({
      privateKey: null,
      publicKey: null,
      fingerprint: null,
      ready: false,
      loading: false,
    }),
}));
