import { create } from "zustand";

/**
 * In-memory cache of unwrapped shared-space keys (vaultId → 32-byte key), so we
 * only ECDH-open a member's grant once per session. Cleared on logout. Never
 * persisted.
 */
interface SpacesStore {
  spaceKeys: Record<string, Uint8Array>;
  setSpaceKey: (vaultId: string, key: Uint8Array) => void;
  reset: () => void;
}

export const useSpacesStore = create<SpacesStore>((set) => ({
  spaceKeys: {},
  setSpaceKey: (vaultId, key) =>
    set((s) => ({ spaceKeys: { ...s.spaceKeys, [vaultId]: key } })),
  reset: () => set({ spaceKeys: {} }),
}));
