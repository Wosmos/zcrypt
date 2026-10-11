import { create } from "zustand";

export type VaultCollection = "recents" | "starred";

export function parseVaultCollection(value: string | null): VaultCollection | null {
  return value === "recents" || value === "starred" ? value : null;
}

interface VaultViewStore {
  collection: VaultCollection | null;
  setCollection: (collection: VaultCollection | null) => void;
}

export const useVaultView = create<VaultViewStore>((set) => ({
  collection: null,
  setCollection: (collection) => set({ collection }),
}));
