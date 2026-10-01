import { create } from "zustand";

interface ConnectStorageStore {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useConnectStorage = create<ConnectStorageStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
