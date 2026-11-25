import { create } from "zustand";

/**
 * In-memory cache of unwrapped shared-space keys (vaultId → 32-byte key) and
 * the key generation each was opened at, so we only ECDH-open a member's grant
 * once per key. Cleared on logout. Never persisted.
 */
interface SpacesStore {
  spaceKeys: Record<string, Uint8Array>;
  spaceKeyGens: Record<string, number>;
  setSpaceKey: (vaultId: string, key: Uint8Array, gen?: number) => void;
  dropSpaceKey: (vaultId: string) => void;
  reset: () => void;
}

export const useSpacesStore = create<SpacesStore>((set) => ({
  spaceKeys: {},
  spaceKeyGens: {},
  setSpaceKey: (vaultId, key, gen = 0) =>
    set((s) => ({
      spaceKeys: { ...s.spaceKeys, [vaultId]: key },
      spaceKeyGens: { ...s.spaceKeyGens, [vaultId]: gen },
    })),
  dropSpaceKey: (vaultId) =>
    set((s) => {
      const { [vaultId]: _key, ...spaceKeys } = s.spaceKeys;
      const { [vaultId]: _gen, ...spaceKeyGens } = s.spaceKeyGens;
      return { spaceKeys, spaceKeyGens };
    }),
  reset: () => set({ spaceKeys: {}, spaceKeyGens: {} }),
}));
