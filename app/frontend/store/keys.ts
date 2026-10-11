import { create } from "zustand";

/**
 * Session keypair store for zero-knowledge sharing. Holds the user's X25519
 * keypair in memory for the session (the private key is only decrypted from the
 * passphrase-wrapped copy while unlocked, and dropped on logout). Never
 * persisted in plaintext. `fingerprint` is always computed locally from our own
 * private key, never taken from the server.
 */
interface KeysStore {
  privateKey: Uint8Array | null;
  publicKey: Uint8Array | null;
  fingerprint: string | null;
  /** Account master key (mk1). Memory only; same lifecycle as privateKey. */
  masterKey: Uint8Array | null;
  /** Server rollout switch: new vault files may be wrapped under masterKey. */
  masterKeyWrites: boolean;
  ready: boolean;
  loading: boolean;
  /** True when the server's public key for us did not match our private key. */
  mismatch: boolean;
  reset: () => void;
}

export const useKeysStore = create<KeysStore>((set) => ({
  privateKey: null,
  publicKey: null,
  fingerprint: null,
  masterKey: null,
  masterKeyWrites: false,
  ready: false,
  loading: false,
  mismatch: false,
  reset: () =>
    set({
      privateKey: null,
      publicKey: null,
      fingerprint: null,
      masterKey: null,
      masterKeyWrites: false,
      ready: false,
      loading: false,
      mismatch: false,
    }),
}));
